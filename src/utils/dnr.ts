import { hashStringToInt } from "@/utils/tools";
import { rulesMgr } from "@/utils/resource";
import { BypassParams } from "@/rpc/types";

function spoofRulesKey(
  tabId: number,
  bypassParams: BypassParams & { origin: string; referer: string },
) {
  const tag = Object.entries(bypassParams)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`)
    .join(",");
  return hashStringToInt(`spoof_${tabId}_${tag}`);
}

export type SpoofRulesBuilderParams = {
  tabId: number | null;
  bypassParams: BypassParams & { origin: string; referer: string };
  resourceTypes?: string[];
  extraCondition?: Browser.declarativeNetRequest.RuleCondition;
};

export function spoofRulesBuilder({
  tabId,
  bypassParams,
  resourceTypes = ["xmlhttprequest", "csp_report", "main_frame"],
  extraCondition = {},
}: SpoofRulesBuilderParams): any[] {
  const {
    requestUrl,
    origin,
    referer,
    userAgent,
    viewportWidth,
    acceptLanguage,
  } = bypassParams;
  let idx = spoofRulesKey(tabId ?? -1, bypassParams);
  debugLog("Building spoof rules for", {
    idx,
    url: requestUrl,
    origin,
    referer,
  });
  const filter = new URL(requestUrl).origin;

  const viewportWidthRule = viewportWidth
    ? [{ header: "viewport-width", operation: "set", value: viewportWidth }]
    : [];
  const userAgentRule = userAgent
    ? [{ header: "User-Agent", operation: "set", value: userAgent }]
    : [];
  const acceptLanguageRule = acceptLanguage
    ? [{ header: "accept-language", operation: "set", value: acceptLanguage }]
    : [];

  return [
    {
      id: idx++,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "Origin", operation: "set", value: origin },
          { header: "Referer", operation: "set", value: referer },
          ...userAgentRule,
          ...viewportWidthRule,
          ...acceptLanguageRule,
        ],
      },
      condition: {
        tabIds: tabId ? [tabId] : undefined,
        urlFilter: `|${filter}/*`,
        resourceTypes,
        ...extraCondition,
      },
    },
  ];
}

function corsRulesKey(tabId: number, initiatorUrl: string) {
  return hashStringToInt(`cors_${tabId}_${initiatorUrl}`);
}

function corsRulesBuilder(tabId: number, initiatorUrl: string): any[] {
  let idx = corsRulesKey(tabId, initiatorUrl);
  debugLog("Building cors rules for", { idx, url: initiatorUrl });
  const origin = new URL(initiatorUrl).origin;
  return [
    {
      id: idx++,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          {
            header: "Access-Control-Allow-Methods",
            operation: "set",
            value: "GET, POST, PUT, DELETE, HEAD, OPTIONS",
          },

          {
            header: "Access-Control-Allow-Headers",
            operation: "set",
            value: "*,Content-Type,Authorization",
          },
          {
            header: "Access-Control-Expose-Headers",
            operation: "set",
            value: "*",
          },

          {
            header: "Access-Control-Allow-Credentials",
            operation: "set",
            value: "true",
          },
          {
            header: "Access-Control-Allow-Origin",
            operation: "set",
            value: origin,
          },
        ],
      },
      condition: {
        tabIds: [tabId],
        requestMethods: ["get", "post", "put", "delete", "head", "options"],
      },
    },
    {
      id: idx++,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { operation: "remove", header: "content-security-policy" },
          {
            operation: "remove",
            header: "content-security-policy-report-only",
          },
          { operation: "remove", header: "x-webkit-csp" },
          { operation: "remove", header: "x-content-security-policy" },
        ],
      },
      condition: {
        tabIds: [tabId],
        resourceTypes: ["main_frame"],
      },
    },
    {
      id: idx++,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [{ operation: "remove", header: "x-frame-options" }],
      },
      condition: {
        tabIds: [tabId],
        resourceTypes: ["sub_frame"],
      },
    },
  ];
}

export async function installSpoofRules(
  tabId: number | null,
  bypassParams: BypassParams & { origin: string; referer: string },
) {
  const rules = spoofRulesBuilder({
    tabId,
    bypassParams,
  });
  debugLog("Add spoof rules: ", rules);
  await rulesMgr.add(rules);
}

export async function uninstallSpoofRules(
  tabId: number | null,
  bypassParams: BypassParams & { origin: string; referer: string },
) {
  const rules = spoofRulesBuilder({
    tabId,
    bypassParams,
  });
  debugLog("Remove spoof rules: ", rules);
  await rulesMgr.remove(rules);
}

export async function installCORSRules(tabId: number, initiatorUrl: string) {
  const rules = corsRulesBuilder(tabId, initiatorUrl);
  debugLog("Add cors rules: ", rules);
  await rulesMgr.add(rules);
}

export async function uninstallCORSRules(tabId: number, initiatorUrl: string) {
  const rules = corsRulesBuilder(tabId, initiatorUrl);
  debugLog("Remove cors rules: ", rules);
  await rulesMgr.remove(rules);
}
