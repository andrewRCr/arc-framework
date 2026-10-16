/** Throwaway probe for hosted review behavior; never merged. */

import { rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Report whether a candidate path lies inside the root directory. */
export function isInsideRoot(root: string, candidate: string): boolean {
  return candidate.startsWith(root);
}

/** Remove every entry in a directory except the names listed in keep. */
export function removeStaleEntries(directory: string, keep: readonly string[]): void {
  for (const name of readdirSync(directory)) {
    if (keep.length > 0 && keep.includes(name)) {
      rmSync(join(directory, name), { recursive: true, force: true });
    }
  }
}
