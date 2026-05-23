import { LogLevel, type SerializableRequest } from "@/rpc/types";
import { buildLogEntry, persistLogEntry } from "@/utils/logger";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForTabUrl(
  tab: Browser.tabs.Tab,
  timeout: number = MAX_PAGE_LOAD_WAIT_TIME,
): Promise<string | null> {
  let tabUrl = tab.url ?? tab.pendingUrl;
  if (!tabUrl) {
    // Wait a bit and try again,
    // as the URL might not be immediately available for new tabs.
    await sleep(timeout);
  }
  tabUrl = tab.url ?? tab.pendingUrl;
  return tabUrl ?? null;
}

type BrowserRemoteExecutionOptions<T, A extends any[]> = {
  target: Browser.scripting.InjectionTarget;
  func: (...args: A) => T | Promise<T>;
  args: A;
};
export async function browserRemoteExecution<T, A extends any[]>({
  target,
  func,
  args,
}: BrowserRemoteExecutionOptions<T, A>): Promise<T> {
  const results = await browser.scripting.executeScript({ target, func, args });

  if (results && results[0] && results[0].result) {
    return results[0].result as T;
  } else {
    const msg = `Failed to execute script in tab: ${results}`;
    console.error(results);
    debugLog(msg);
    throw new Error(msg);
  }
}

export function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash < 0 ? -hash : hash;
}

export function extractUrl(
  input: Request | SerializableRequest | string | URL,
): string {
  if (typeof input == "string") return input;
  else if (input instanceof URL) return input.toString();
  else return input.url;
}

export function getHeaderValue(
  headers: HeadersInit | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  return new Headers(headers).get(name) ?? undefined;
}

function writeDebugLog(level: LogLevel, args: any[]) {
  const stack = new Error().stack ?? "";
  console[level]("[AutoNovel.addon]", ...args);
  persistLogEntry(buildLogEntry(level, args, stack));
}

export function debugLog(...args: any[]) {
  writeDebugLog(LogLevel.Debug, args);
}
debugLog.info = (...args: any[]) => writeDebugLog(LogLevel.Info, args);
debugLog.error = (...args: any[]) => writeDebugLog(LogLevel.Error, args);
debugLog.warn = (...args: any[]) => writeDebugLog(LogLevel.Warn, args);

export function newError(msg: string) {
  return new Error(`[AutoNovel.addon] ${msg}`);
}

export function b64EncodeUnicode(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    }),
  );
}

export function rebuildCookieUrl(cookie: Browser.cookies.Cookie): string {
  const protocol = cookie.secure ? "https://" : "http://";
  const domain = cookie.domain.startsWith(".")
    ? cookie.domain.substring(1)
    : cookie.domain;
  const url = `${protocol}${domain}${cookie.path}`;
  return url;
}

export function cookie2SetDetail(
  cookie: Browser.cookies.Cookie,
): Browser.cookies.SetDetails {
  const setDetail = {
    url: rebuildCookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    storeId: cookie.storeId,
    ...(cookie.expirationDate && { expirationDate: cookie.expirationDate }),
  };
  return setDetail;
}
