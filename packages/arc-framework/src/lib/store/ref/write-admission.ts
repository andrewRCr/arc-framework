/** Validate a prepared write's captured namespace inside the local publication boundary. */

import { readRefTips } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { isStateRef } from "./manifest.js";

/** Changed logical refs require an internal rebuild; temporary and comparison refs do not. */
export async function refAdmissionBasisChanged(context: RefBackendContext,
  captured: ReadonlyMap<string, string>): Promise<boolean> {
  const current = await readRefTips(context, { includeHistory: true });
  const before = new Map([...captured].filter(([ref]) => isStateRef(ref)));
  const after = new Map([...current].filter(([ref]) => isStateRef(ref)));
  return before.size !== after.size || [...before].some(([ref, tip]) => after.get(ref) !== tip);
}
