/** Enter checkout-scoped activities without loading the current work unit. */
import type { AgendaCompileInput } from "./compile-input.js";
import { createSessionInitAgenda } from "./document.js";
import { compileCheckoutSessionOrientation, orderOrientationSurfaces } from "./orientation.js";
import { compileSyncPrefix } from "./prefix.js";
import { carryAgendaAnswers } from "./progress.js";
import { compileUniversalReads } from "./reads.js";
import type { AgendaOrientation, AgendaStep, SessionInitAgenda } from "./schema.js";

/** Hand a Housekeep sweep to its owning workflow after checkout context. */
export function compileHousekeepSignal(input: AgendaCompileInput): Promise<SessionInitAgenda> {
  return compileCheckoutEntry(input, { shape: "subject", subject: { kind: "housekeep", key: null } },
    { type: "fragment", target: { kind: "workflow", path: ".arc/system/workflows/arc/supplemental/drain-inbox.md" }, args: {} });
}

/** Load and orient on this checkout without entering a work unit or another activity. */
export function compileContextSignal(input: AgendaCompileInput): Promise<SessionInitAgenda> {
  return compileCheckoutEntry(input, { shape: "checkout" }, { type: "gate", kind: "stop", autoProceed: false });
}

async function compileCheckoutEntry(input: AgendaCompileInput, orientation: AgendaOrientation, tail: AgendaStep): Promise<SessionInitAgenda> {
  const prefix = compileSyncPrefix(input, "notes");
  if (prefix.at(-1)?.type === "exec") return createSessionInitAgenda(input, orientation, carryAgendaAnswers(input, prefix));
  return createSessionInitAgenda(input, orientation, carryAgendaAnswers(input, [
    ...prefix, ...await compileUniversalReads(input),
    ...orderOrientationSurfaces(compileCheckoutSessionOrientation(input, "notes")), tail,
  ]));
}
