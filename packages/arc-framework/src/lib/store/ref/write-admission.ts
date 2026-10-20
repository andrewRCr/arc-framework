/** Validate a prepared write's captured namespace inside the local publication boundary. */

import { HistoryRefSchema } from "../refusal.js";
import { readRefTips } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { isManifestRef } from "./manifest.js";

/** Changed logical refs require an internal rebuild; temporary and comparison refs do not. */
export async function refAdmissionBasisChanged(context: RefBackendContext,
  captured: ReadonlyMap<string, string>): Promise<boolean> {
  const current = await readRefTips(context, { includeHistory: true });
  const logical = (ref: string): boolean => isManifestRef(ref) || HistoryRefSchema.safeParse(ref).success;
  const before = new Map([...captured].filter(([ref]) => logical(ref)));
  const after = new Map([...current].filter(([ref]) => logical(ref)));
  return before.size !== after.size || [...before].some(([ref, tip]) => after.get(ref) !== tip);
}
