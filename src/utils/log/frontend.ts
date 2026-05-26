import {
  MessageType,
  type DebugLogPayload,
  LogContext,
  LogLevel,
} from "@/rpc/types";
import { buildLogEntry, LOG_PREFIX } from "@/utils/log/shared";

function forwardLog(level: LogLevel, args: unknown[]): void {
  console[level](LOG_PREFIX, ...args);
  if (typeof window === "undefined" || !window.postMessage) return;

  const payload: DebugLogPayload = {
    entry: buildLogEntry(level, args, LogContext.Inject),
  };
  window.postMessage({ type: MessageType.DebugLog, payload }, "*");
}

export function debugLog(...args: unknown[]) {
  forwardLog(LogLevel.Debug, args);
}

debugLog.info = (...args: unknown[]) => forwardLog(LogLevel.Info, args);
debugLog.error = (...args: unknown[]) => forwardLog(LogLevel.Error, args);
debugLog.warn = (...args: unknown[]) => forwardLog(LogLevel.Warn, args);
