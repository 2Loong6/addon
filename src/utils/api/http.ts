import { SerializableResponse, serializeResponse } from "@/rpc/types";
import { rateLimiter } from "@/utils/rate-limit";
import { extractUrl, getHeaderValue } from "@/utils/tools";
import { local_install_bypass, local_uninstall_bypass } from "./bypass";

export async function http_fetch(
  input: Request | string | URL,
  requestInit?: RequestInit,
): Promise<SerializableResponse> {
  const url = extractUrl(input);
  const userAgent = getHeaderValue(requestInit?.headers, "User-Agent");
  const viewportWidth = getHeaderValue(requestInit?.headers, "viewport-width");

  const tabId = null;
  const bypassParams = {
    requestUrl: url,
    spoofOrigin: url,
    userAgent,
    viewportWidth,
  };

  const release = await rateLimiter.acquire(rateLimiter.urlToKey(url));
  try {
    await local_install_bypass(tabId, bypassParams);
    const resp = await fetch(input, requestInit);
    return serializeResponse(resp);
  } catch (e) {
    debugLog.error(`Error in http_fetch for url ${url}:`, e);
    throw e;
  } finally {
    await local_uninstall_bypass(tabId, bypassParams);
    await release();
  }
}
