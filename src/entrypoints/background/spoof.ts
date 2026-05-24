/*
  对于小说页面的 external link 进行伪装：
  1. Pixiv 的 img link
 */

import { rulesMgr } from "@/utils/resource";
import { spoofRulesBuilder } from "@/utils/dnr";
import { AutoNovelDomains } from "@/shared/consts";
import { debugLog } from "@/utils/log/backend";

/*
  page:    https://n.novelia.cc/novel/pixiv/s26651790/26651790
  example: https://i.pximg.net/novel-cover-original/img/2025/12/06/17/31/13/tei163340311628_c4e1d4d2ebae39b37ad8235407f29b73.jpg
 */
async function SpoofPixivImg() {
  const rule = spoofRulesBuilder({
    tabId: null,
    bypassParams: {
      requestUrl: "https://i.pximg.net",
      origin: "https://i.pximg.net",
      referer: "https://www.pixiv.net",
    },
    resourceTypes: [
      "main_frame",
      "sub_frame",
      "script",
      "image",
      "font",
      "object",
      "xmlhttprequest",
      "other",
      "csp_report",
      "media",
    ],
    extraCondition: {
      initiatorDomains: AutoNovelDomains,
    },
  });
  debugLog("Add Pixiv image spoof rules: ", rule);
  await rulesMgr.add(rule);
}

/*
 https://img.syosetu.org/img/user/v2/3897/265/209767.png
 https://n.novelia.cc/novel/hameln/362665/1
 */
async function SpoofSyosetuImg() {
  const rule = spoofRulesBuilder({
    tabId: null,
    bypassParams: {
      requestUrl: "https://img.syosetu.org",
      origin: "https://img.syosetu.org",
      referer: "https://img.syosetu.org",
    },
    resourceTypes: [
      "main_frame",
      "sub_frame",
      "script",
      "image",
      "font",
      "object",
      "xmlhttprequest",
      "other",
      "csp_report",
      "media",
    ],
    extraCondition: {
      initiatorDomains: AutoNovelDomains,
    },
  });
  debugLog("Add Syosetu image spoof rules: ", rule);
  await rulesMgr.add(rule);
}

export async function SpoofInit() {
  await Promise.all([SpoofPixivImg(), SpoofSyosetuImg()]);
}
