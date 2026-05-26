import {
  LogContext,
  type LogEntry,
  LogLevel,
  type SerializableLogValue,
} from "@/rpc/types";
import { VERSION } from "@/shared/consts";

export const LOG_PREFIX = "[AutoNovel.addon]";
export const LOG_MAX_ENTRIES = 200;
export const LOG_STORAGE_PREFIX = "debug-log:";

const MAX_DEPTH = 6;
const MAX_ARRAY_LENGTH = 100;
const MAX_OBJECT_KEYS = 100;

function formatUtc8Time(timestamp: number): string {
  const utc8 = new Date(timestamp + 8 * 60 * 60 * 1000);
  return `${utc8.toISOString().replace("Z", "+08:00")}`;
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

export function serializeLogValue(
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
      !line.includes("backend.ts") &&
      !line.includes("frontend.ts") &&
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
  context: LogContext,
): LogEntry {
  const timestamp = Date.now();
  return {
    id: `${timestamp}-${Math.random().toString(2)}`,
    timestamp,
    isoTime: formatUtc8Time(timestamp),
    level,
    context,
    args: args.map((arg) => serializeLogValue(arg)),
    text: formatLogText(args),
    version: VERSION,
  };
}
