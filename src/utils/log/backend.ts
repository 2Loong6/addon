import { LogContext, LogLevel, type LogEntry } from "@/rpc/types";
import {
  buildLogEntry,
  LOG_MAX_ENTRIES,
  LOG_PREFIX,
  LOG_STORAGE_PREFIX,
} from "@/utils/log/shared";

let pendingLogEntryCount = 0;

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

export async function trimLogEntries(
  maxEntries = LOG_MAX_ENTRIES,
): Promise<number> {
  if (!hasExtensionStorage()) return 0;
  const snapshot = await storage.snapshot("local");
  const logItems = Object.entries(snapshot)
    .filter(([key, value]) => {
      return (
        isLogSnapshotKey(key) &&
        typeof value === "object" &&
        value != null &&
        typeof (value as Partial<LogEntry>).timestamp === "number"
      );
    })
    .sort(([, a], [, b]) => {
      return (a as LogEntry).timestamp - (b as LogEntry).timestamp;
    });

  const removeCount = Math.max(0, logItems.length - maxEntries);
  if (removeCount === 0) return 0;

  console.log(
    `[AutoNovel.addon] Trimming ${removeCount} log entries to maintain storage limits`,
  );

  const keysToRemove = logItems
    .slice(0, removeCount)
    .map(([key]) => toLocalStorageKey(key));

  await Promise.all(keysToRemove.map((key) => storage.removeItem(key)));
  return keysToRemove.length;
}

async function scheduleTrimLogEntries(): Promise<void> {
  pendingLogEntryCount++;
  if (pendingLogEntryCount <= LOG_MAX_ENTRIES) return;

  pendingLogEntryCount = 0;
  await trimLogEntries();
  console.log(
    "[AutoNovel.addon] Trimmed log entries to maintain storage limits",
  );
}

export async function appendLogEntry(entry: LogEntry): Promise<void> {
  if (!hasExtensionStorage()) return;
  const key = `local:${LOG_STORAGE_PREFIX}${entry.id}` as StorageItemKey;
  await storage.setItem(key, entry);
  await scheduleTrimLogEntries();
}

export function persistLogEntry(entry: LogEntry): void {
  if (!hasExtensionStorage()) return;
  void appendLogEntry(entry).catch((error) => {
    console.warn(LOG_PREFIX, "Failed to persist debug log", error);
  });
}

function writeDebugLog(level: LogLevel, args: unknown[]) {
  console[level](LOG_PREFIX, ...args);
  persistLogEntry(buildLogEntry(level, args, LogContext.Background));
}

export async function clearLogs(): Promise<number> {
  if (!hasExtensionStorage()) return 0;
  const snapshot = await storage.snapshot("local");
  const keys = Object.keys(snapshot).filter(isLogSnapshotKey);
  await Promise.all(
    keys.map((key) => storage.removeItem(toLocalStorageKey(key))),
  );
  pendingLogEntryCount = 0;
  return keys.length;
}

export async function getLogEntries(): Promise<LogEntry[]> {
  if (!hasExtensionStorage()) return [];
  const snapshot = await storage.snapshot("local");
  return Object.entries(snapshot)
    .filter(([key, value]) => {
      return (
        isLogSnapshotKey(key) &&
        typeof value === "object" &&
        value != null &&
        typeof (value as Partial<LogEntry>).timestamp === "number"
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
