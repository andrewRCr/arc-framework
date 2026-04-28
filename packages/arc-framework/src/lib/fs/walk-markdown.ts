/**
 * Recursive `.md` file walker.
 *
 * Returns all `.md` paths under `dir` in arbitrary order — callers sort if a
 * deterministic order is needed. Used by the extensions probe to collect
 * workflow inputs and by the audit script to enumerate corpus files.
 *
 * @module
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** Recursively collect `.md` paths under `dir`. */
export async function walkMarkdown(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      out.push(...(await walkMarkdown(full)));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}
