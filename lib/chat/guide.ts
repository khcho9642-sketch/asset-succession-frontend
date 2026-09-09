// Node-only: this module must never be imported by a client component.
import { readFileSync } from "node:fs";
import path from "node:path";

const START_MARKER = "<!-- CHAT_GUIDE_RUNTIME_START -->";
const END_MARKER = "<!-- CHAT_GUIDE_RUNTIME_END -->";

/** Exclude developer notes and fail closed if the runtime section is ambiguous. */
export function extractChatGuideRuntime(document: string): string {
  if (document.split(START_MARKER).length !== 2 || document.split(END_MARKER).length !== 2) {
    throw new Error("CHAT_GUIDE.md must contain exactly one runtime start marker and one end marker.");
  }
  const lines = document.split(/\r?\n/);
  const start = lines.indexOf(START_MARKER);
  const end = lines.indexOf(END_MARKER);
  if (start < 0 || end <= start) {
    throw new Error("CHAT_GUIDE.md runtime markers must be standalone lines in start/end order.");
  }
  const runtime = lines.slice(start + 1, end).join("\n").trim();
  if (!runtime) throw new Error("CHAT_GUIDE.md runtime section must not be empty.");
  return runtime;
}

/** Read the deployed guide on the server; a missing guide must not select another policy. */
export function loadChatGuideRuntime(): string {
  if (typeof window !== "undefined") throw new Error("CHAT_GUIDE.md can only be loaded on the server.");
  let document: string;
  try {
    document = readFileSync(path.join(process.cwd(), "CHAT_GUIDE.md"), "utf8");
  } catch (cause) {
    throw new Error("CHAT_GUIDE.md could not be loaded.", { cause });
  }
  return extractChatGuideRuntime(document);
}
