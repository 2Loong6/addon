import {
  MessageType,
  type DebugLogPayload,
  LogContext,
  type LogEntry,
  LogLevel,
  type SerializableLogValue,
} from "@/rpc/types";
import { VERSION } from "@/utils/consts";

// 1day
export const LOG_RETENTION_MS = 24 * 60 * 60 * 1000;
export const LOG_STORAGE_PREFIX = "debug-log:";

const PREFIX = "[AutoNovel.addon]";
const MAX_DEPTH = 6;
const MAX_ARRAY_LENGTH = 100;
const MAX_OBJECT_KEYS = 100;
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

function formatUtc8Time(timestamp: number): string {
  const utc8 = new Date(timestamp + 8 * 60 * 60 * 1000);
  return `${utc8.toISOString().replace("Z", "+08:00")}`;
}

export function detectLogContext(): LogContext {
  if (!hasBrowserRuntime()) return LogContext.Inject;
  if (typeof window !== "undefined") return LogContext.Content;
  return LogContext.Background;
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(serializeLogValue(value));
  } catch {
    return String(value);
  }
}

export function formatLogText(args: unknown[]): string {
  return args.map(stringifyValue).join(" ");
}

function serializeLogValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): SerializableLogValue {
  if (value == null) return null;

  const valueType = typeof value;
  if (
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean"
  ) {
    if (typeof value === "number")
      return Number.isFinite(value) ? value : String(value);
    return value as string | boolean;
  }
  if (
    valueType === "bigint" ||
    valueType === "symbol" ||
    valueType === "function"
  ) {
    return String(value);
  }

  if (depth >= MAX_DEPTH) return "[MaxDepth]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? "",
    };
  }

  if (value instanceof URL) return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => serializeLogValue(item, depth + 1, seen));
  }

  const record: Record<string, SerializableLogValue> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    record[key] = serializeLogValue(item, depth + 1, seen);
  }
  return record;
}

export function parseCaller(stack: string): string {
  const lines = stack.split("\n").map((line) => line.trim());
  const caller = lines.find((line) => {
    return (
      line.startsWith("at ") &&
      !line.includes("buildLogEntry") &&
      !line.includes("writeDebugLog") &&
      !line.includes("persistLogEntry") &&
      !line.includes("debugLog") &&
      !line.includes("logger.ts") &&
      !line.includes("tools.ts")
    );
  });
  if (!caller) return "unknown";
  return caller.replace(/^at\s+/, "").replace(/\s+\(.+\)$/, "");
}

export function buildLogEntry(
  level: LogLevel,
  args: unknown[],
  stack = new Error().stack ?? "",
  context = detectLogContext(),
): LogEntry {
  const timestamp = Date.now();
  return {
    id: `${timestamp}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    timestamp,
    isoTime: formatUtc8Time(timestamp),
    level,
    context,
    functionName: parseCaller(stack),
    args: args.map((arg) => serializeLogValue(arg)),
    text: formatLogText(args),
    stack,
    version: VERSION,
  };
}

export async function appendLogEntry(entry: LogEntry): Promise<void> {
  if (!hasExtensionStorage()) return;
  await storage.setItem(`local:${LOG_STORAGE_PREFIX}${entry.id}`, entry);
  schedulePruneLogs();
}

export function forwardLogEntry(entry: LogEntry): void {
  if (typeof window === "undefined" || !window.postMessage) return;
  const payload: DebugLogPayload = { entry };
  window.postMessage({ type: MessageType.DebugLog, payload }, "*");
}

export function persistLogEntry(entry: LogEntry): void {
  if (hasExtensionStorage()) {
    void appendLogEntry(entry).catch((error) => {
      console.warn(PREFIX, "Failed to persist debug log", error);
    });
    return;
  }
  forwardLogEntry(entry);
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
