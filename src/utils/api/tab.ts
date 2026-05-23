import {
  BypassParams,
  ClientCmd,
  SerializableRequest,
  SerializableResponse,
} from "@/rpc/types";
import { tabResMgr } from "@/utils/resource";
import { rateLimiter } from "@/utils/rate-limit";
import {
  browserRemoteExecution,
  extractUrl,
  getHeaderValue,
  newError,
} from "@/utils/tools";
import { local_install_bypass, local_uninstall_bypass } from "./bypass";

/**
 * Injected script for tab DOM querySelectorAll.
 * No external variable references - only uses parameters and Web APIs.
 * Serializable for browser.scripting.executeScript.
 */
function injectedDomQuerySelectorAll(sel: string): string[] {
  const elements = document.querySelectorAll(sel);
  const texts: string[] = Array.from(elements).map((el) => el.outerHTML);
  return texts;
}

export async function tab_dom_querySelectorAll(
  params: Parameters<ClientCmd["tab.dom.querySelectorAll"]>[0],
): Promise<string[]> {
  const { url, selector } = params;
  const tab = await tabResMgr.findOrCreateTab(url);
  try {
    const results = await browserRemoteExecution({
      target: { tabId: tab.id! },
      func: injectedDomQuerySelectorAll,
      args: [selector],
    });
    return results;
  } finally {
    await tabResMgr.releaseTab(tab.id!);
  }
}

/**
 * Injected script for tab HTTP fetch operations.
 * No external variable references - only uses parameters and Web APIs.
 * Serializable for browser.scripting.executeScript.
 * Note: Helper functions are nested inside to avoid closure issues during serialization.
 */
async function injectedTabHttpFetch(
  input: SerializableRequest | string,
  requestInit: RequestInit | null,
): Promise<SerializableResponse> {
  // Keep helpers inside injected function to avoid executeScript closure issues.
  function injectedDeserializeRequest(req: SerializableRequest): RequestInfo {
    if (typeof req === "string") {
      return req;
    }

    const init: RequestInit = {
      method: req.method,
      headers: new Headers(req.headers),
      body: req.body,
      mode: req.mode,
      credentials: req.credentials,
      cache: req.cache,
      redirect: req.redirect,
      referrer: req.referrer,
      integrity: req.integrity,
    };

    return new Request(req.url, init);
  }

  function injectedSerReqToRequestInfo(input: SerializableRequest | string) {
    let finalInput: RequestInfo;
    switch (typeof input) {
      case "string": {
        finalInput = input;
        break;
      }
      case "object": {
        finalInput = injectedDeserializeRequest(input as SerializableRequest);
        break;
      }
      default:
        throw new Error("Invalid input type for tab_http_fetch");
    }
    return finalInput;
  }

  async function injectedResponseToSerializableResponse(
    response: Response,
  ): Promise<SerializableResponse> {
    const headers: [string, string][] = Array.from(response.headers.entries());
    const bodyText = await response.text();

    return {
      body: bodyText,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers,
      redirected: response.redirected,
      url: response.url,
      type: response.type,
    };
  }

  const requestInput = injectedSerReqToRequestInfo(input);
  const response = await fetch(requestInput, requestInit || {});
  const responseSer = await injectedResponseToSerializableResponse(response);
  return responseSer;
}

export async function tab_http_fetch(
  params: Parameters<ClientCmd["tab.http.fetch"]>[0],
): Promise<SerializableResponse> {
  const { options, input, requestInit } = params;

  const userAgent = getHeaderValue(requestInit?.headers, "User-Agent");
  const viewportWidth = getHeaderValue(requestInit?.headers, "viewport-width");

  const { tabUrl, forceNewTab } = options;

  const url = extractUrl(input);
  const release = await rateLimiter.acquire(rateLimiter.urlToKey(url));

  const bypassParams: BypassParams = {
    requestUrl: url,
    userAgent,
    viewportWidth,
    // incase of `Referrer Policystrict-origin-when-cross-origin`
    // origin: new URL(tabUrl).origin,
  };

  try {
    const tab = await tabResMgr.findOrCreateTab(tabUrl, { forceNewTab });
    if (tab.id == null) throw newError(`Tab has no id: ${tab}`);

    try {
      await local_install_bypass(tab.id, bypassParams);
      const respSer = await browserRemoteExecution({
        target: { tabId: tab.id },
        func: injectedTabHttpFetch,
        args: [input, requestInit ?? null],
      });
      return respSer;
    } catch (e) {
      debugLog.error(
        `Error in tab_http_fetch for url ${url} in tab ${tab.id}:`,
        e,
      );
      throw e;
    } finally {
      await local_uninstall_bypass(tab.id, bypassParams);
      await tabResMgr.releaseTab(tab.id);
    }
  } finally {
    await release();
  }
}
