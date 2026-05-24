import { BypassParams } from "@/rpc/types";
import {
  installCORSRules,
  installSpoofRules,
  uninstallCORSRules,
  uninstallSpoofRules,
} from "@/utils/dnr";
import { debugLog } from "@/utils/log/backend";
import { newError, waitForTabUrl } from "@/utils/tools";

export async function local_install_bypass(
  tabId: number | null,
  bypassParams: BypassParams,
): Promise<void> {
  const { requestUrl, origin, referer } = bypassParams;
  const _origin = origin ?? new URL(requestUrl).origin;
  const _referer = referer ?? `${_origin}/`;
  const promises = [];
  if (tabId) {
    const tab = await browser.tabs.get(tabId);

    const tabUrl = await waitForTabUrl(tab);
    if (!tabUrl) {
      debugLog.error(`Tab has no url: ${tab}`);
      throw newError(`Tab has no url: ${tab}`);
    }
    promises.push(installCORSRules(tabId, tabUrl));
  }
  promises.push(
    installSpoofRules(tabId, {
      ...bypassParams,
      origin: _origin,
      referer: _referer,
    }),
  );
  await Promise.all(promises);
}

export async function local_uninstall_bypass(
  tabId: number | null,
  bypassParams: BypassParams,
): Promise<void> {
  const { requestUrl, origin, referer } = bypassParams;
  const _origin = origin ?? new URL(requestUrl).origin;
  const _referer = referer ?? `${_origin}/`;

  const promises = [
    uninstallSpoofRules(tabId, {
      ...bypassParams,
      origin: _origin,
      referer: _referer,
    }),
  ];
  if (tabId) {
    const tab = await browser.tabs.get(tabId);
    const tabUrl = await waitForTabUrl(tab);
    if (!tabUrl) {
      debugLog.error("Tab has no url:", tab);
      throw newError(`Tab has no url: ${tab}`);
    }
    promises.push(uninstallCORSRules(tabId, tabUrl));
  }
  await Promise.all(promises);
}
