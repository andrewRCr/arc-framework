/** Observe one registered checkout's personal digest without holding or changing any ref. */
import { resolve } from "node:path";
import { readWindowCheckouts } from "./checkouts.js";
import { createWindowImportContext } from "./import-context.js";
import { readWindowPersonalState } from "./digests.js";
import type { WindowHoldIO, WindowRecord } from "./hold.js";
import { WindowRefusal, type WindowResult } from "./result.js";

/** Report a late personal change; the checkout step decides whether to retain its pre-flip files. */
export async function compareWindowCheckout(io: WindowHoldIO, record: WindowRecord, path: string): Promise<WindowResult> {
  const checkout = resolve(io.repo, path), checkouts = await readWindowCheckouts(io);
  if (!checkouts.some(entry => entry.path === checkout)) throw new WindowRefusal([{ subject: checkout,
    condition: "The checkout is not registered.", remedy: "Name a registered checkout with --checkout and retry compare." }]);
  const personal = await readWindowPersonalState(await createWindowImportContext(io.repo), checkouts);
  const recorded = record.worktrees.find(entry => entry.path === checkout)?.personalDigest ?? null;
  const observed = personal.digests[checkout];
  if (observed === undefined) throw new Error(`No acquired personal digest for ${checkout}. Restore access and retry compare.`);
  const changed = recorded !== observed;
  return { operation: "compare", status: "reported", findings: [], data: { checkout, recorded, observed, changed },
    messages: [`${checkout}: personal digest ${changed ? "changed" : "unchanged"}; recorded ${recorded ?? "unrecorded checkout"}; observed ${observed}.`] };
}
