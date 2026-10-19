/** Acquire the user view's in-flight rows from local operational membership. */
import { deriveStoreInFlight, type DeriveStoreInFlightOptions } from "../git/in-flight-store.js";
import type { StatusViewRow } from "./render.js";
import { buildInFlightMineSlice } from "./in-flight-mine.js";
import { renderInFlightWarning } from "../git/in-flight-derivation.js";

/** Store membership inputs and an optional invocation-bound reader. */
export interface StoreUserInFlightOptions extends DeriveStoreInFlightOptions {
  readInFlight?: typeof deriveStoreInFlight;
}
/** Renderable membership and the acquisition's human diagnostics. */
export interface StoreUserInFlightSlice { rows: StatusViewRow[]; warnings: string[] }

/** Read local membership without consulting or writing a cached user view. */
export async function readStoreUserInFlight(options: StoreUserInFlightOptions): Promise<StoreUserInFlightSlice> {
  const { readInFlight = deriveStoreInFlight, ...input } = options;
  const result = await readInFlight(input);
  const rows = buildInFlightMineSlice(result.entries);
  const warnings = result.warnings.map(renderInFlightWarning);
  if (result.marks?.includes("degraded") === true) {
    warnings.push("The in-flight slice may be incomplete. Repair the reported evidence, then retry arc status --user.");
  }
  return { rows, warnings };
}
