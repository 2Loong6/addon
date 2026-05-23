import JSZip from "jszip";

import type { LogEntry } from "@/rpc/types";
import { VERSION } from "@/utils/consts";
import { getLogEntries } from "@/utils/logger";

export enum LogExportRange {
  LastHour = "last-hour",
  All = "all",
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function formatTextLog(entry: LogEntry): string {
  return [
    `[${entry.isoTime}] [${entry.level.toUpperCase()}] [${entry.context}] ${entry.text}`,
    `version: ${entry.version}`,
    `function: ${entry.functionName}`,
    `args: ${JSON.stringify(entry.args)}`,
    `stack:\n${entry.stack}`,
  ].join("\n");
}

function buildZipName(entries: LogEntry[]): string {
  const now = Date.now();
  const startTimestamp = entries[0]?.timestamp ?? now;
  const endTimestamp = entries.at(-1)?.timestamp ?? startTimestamp;
  return `addon-${VERSION}-log-${startTimestamp}-${endTimestamp}.zip`;
}

export async function exportLogs(
  range: LogExportRange,
): Promise<{ count: number; filename: string }> {
  const since =
    range === LogExportRange.LastHour ? Date.now() - ONE_HOUR_MS : undefined;
  const entries = await getLogEntries({ since });
  const zip = new JSZip();

  const jsonl = entries.map((entry) => JSON.stringify(entry)).join("\n");
  const text =
    entries.length > 0
      ? entries.map(formatTextLog).join("\n\n---\n\n")
      : "No logs found for selected range.\n";

  zip.file("logs.jsonl", jsonl + (jsonl ? "\n" : ""));
  zip.file("logs.txt", text);
  zip.file(
    "metadata.json",
    JSON.stringify(
      {
        version: VERSION,
        range,
        exportedAt: new Date().toISOString(),
        count: entries.length,
        startTimestamp: entries[0]?.timestamp ?? null,
        endTimestamp: entries.at(-1)?.timestamp ?? null,
      },
      null,
      2,
    ),
  );

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const filename = buildZipName(entries);

  try {
    await browser.downloads.download({ url, filename, saveAs: true });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return { count: entries.length, filename };
}
