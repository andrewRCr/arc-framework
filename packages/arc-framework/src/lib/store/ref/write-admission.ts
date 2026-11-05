/** Validate a prepared write's captured namespace inside the local publication boundary. */

import { readRefTips } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { isStateRef } from "./manifest.js";

/** Report changed logical refs and observed absence; temporary and comparison refs do not require rebuilding. */
export async function refAdmissionBasisChanged(context: RefBackendContext,
  captured: ReadonlyMap<string, string>): Promise<ReadonlyMap<string, string | null>> {
  const current = await readRefTips(context, { includeHistory: true });
  const before = new Map([...captured].filter(([ref]) => isStateRef(ref)));
  const after = new Map([...current].filter(([ref]) => isStateRef(ref)));
  return new Map([...new Set([...before.keys(), ...after.keys()])]
    .filter(ref => before.get(ref) !== after.get(ref)).map(ref => [ref, after.get(ref) ?? null]));
}
