import { LogContext, LogLevel, type LogEntry } from "@/rpc/types";
import {
  buildLogEntry,
  LOG_PREFIX,
  LOG_RETENTION_MS,
  LOG_STORAGE_PREFIX,
} from "@/utils/log/shared";

let prunePromise: Promise<void> | null = null;

function hasBrowserRuntime(): boolean {
  return typeof browser !== "undefined" && !!browser.runtime;
}

function hasExtensionStorage(): boolean {
  return typeof storage !== "undefined" && hasBrowserRuntime();
}

function isLogSnapshotKey(key: string): boolean {
  return (
    key.startsWith(LOG_STORAGE_PREFIX) ||
    key.startsWith(`local:${LOG_STORAGE_PREFIX}`)
  );
}

function toLocalStorageKey(key: string): StorageItemKey {
  if (key.startsWith("local:")) return key as StorageItemKey;
  return `local:${key}` as StorageItemKey;
}

function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /quota|kQuotaBytes/i.test(error.message);
}

export async function pruneOldestHalfLogs(): Promise<number> {
  if (!hasExtensionStorage()) return 0;
  const snapshot = await storage.snapshot("local");
  const logItems = Object.entries(snapshot)
    .filter(([, value]) => {
      return (
        typeof value === "object" &&
        value != null &&
        typeof (value as Partial<LogEntry>).timestamp === "number"
      );
    })
    .filter(([key]) => isLogSnapshotKey(key))
    .sort(([, a], [, b]) => {
      return (a as LogEntry).timestamp - (b as LogEntry).timestamp;
    });

  const keysToRemove = logItems
    .slice(0, Math.ceil(logItems.length / 2))
    .map(([key]) => toLocalStorageKey(key));

  await Promise.all(keysToRemove.map((key) => storage.removeItem(key)));
  return keysToRemove.length;
}

export async function appendLogEntry(entry: LogEntry): Promise<void> {
  if (!hasExtensionStorage()) return;
  const key = `local:${LOG_STORAGE_PREFIX}${entry.id}` as StorageItemKey;
  try {
    await storage.setItem(key, entry);
  } catch (error) {
    if (!isQuotaExceededError(error)) throw error;
    await pruneOldestHalfLogs();
    await storage.setItem(key, entry);
  }
  schedulePruneLogs();
}

export function persistLogEntry(entry: LogEntry): void {
  if (!hasExtensionStorage()) return;
  void appendLogEntry(entry).catch((error) => {
    console.warn(LOG_PREFIX, "Failed to persist debug log", error);
  });
}

function writeDebugLog(level: LogLevel, args: unknown[]) {
  const stack = new Error().stack ?? "";
  console[level](LOG_PREFIX, ...args);
  persistLogEntry(buildLogEntry(level, args, stack, LogContext.Background));
}

export async function pruneLogs(now = Date.now()): Promise<void> {
  if (!hasExtensionStorage()) return;
  const cutoff = now - LOG_RETENTION_MS;
  const snapshot = await storage.snapshot("local");
  const outdatedKeys = Object.entries(snapshot)
    .filter(([key, value]) => {
      return (
        isLogSnapshotKey(key) &&
        typeof value === "object" &&
        value != null &&
        typeof (value as Partial<LogEntry>).timestamp === "number" &&
        (value as LogEntry).timestamp < cutoff
      );
    })
    .map(([key]) => toLocalStorageKey(key));

  await Promise.all(outdatedKeys.map((key) => storage.removeItem(key)));
}

export async function clearLogs(): Promise<number> {
  if (!hasExtensionStorage()) return 0;
  const snapshot = await storage.snapshot("local");
  const keys = Object.keys(snapshot).filter(isLogSnapshotKey);
  await Promise.all(
    keys.map((key) => storage.removeItem(toLocalStorageKey(key))),
  );
  return keys.length;
}

export function schedulePruneLogs(): void {
  if (prunePromise) return;
  prunePromise = pruneLogs().finally(() => {
    prunePromise = null;
  });
}

export async function getLogEntries(
  options: { since?: number } = {},
): Promise<LogEntry[]> {
  if (!hasExtensionStorage()) return [];
  await pruneLogs();
  const snapshot = await storage.snapshot("local");
  return Object.entries(snapshot)
    .filter(([key, value]) => {
      return (
        isLogSnapshotKey(key) &&
        typeof value === "object" &&
        value != null &&
        typeof (value as Partial<LogEntry>).timestamp === "number" &&
        (!options.since || (value as LogEntry).timestamp >= options.since)
      );
    })
    .map(([, value]) => value as LogEntry)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function debugLog(...args: unknown[]) {
  writeDebugLog(LogLevel.Debug, args);
}

debugLog.info = (...args: unknown[]) => writeDebugLog(LogLevel.Info, args);
debugLog.error = (...args: unknown[]) => writeDebugLog(LogLevel.Error, args);
debugLog.warn = (...args: unknown[]) => writeDebugLog(LogLevel.Warn, args);
