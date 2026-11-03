/** In-repository materialization includes restoring the entering checkout's personal notes. */
import type { MaterializableWorkUnit } from "../../lib/session-init/materializable-work-units.js";
import { buildAgendaArgv } from "./argv.js";
import type { AgendaCompileInput } from "./compile-input.js";
import type { OfferChoice } from "./schema.js";

/** Add explicit in-place choices only while lifecycle state lives in the checkout. */
export function compileLegacyMaterializeChoices(input: AgendaCompileInput, candidates: readonly MaterializableWorkUnit[]): OfferChoice[] {
  if (input.entry.store?.capabilities.stateOffBranch === true) return [];
  return candidates.map(candidate => ({ kind: "actions", label: `Materialize ${candidate.name} in this checkout`, accepts: [], actions: [
    { text: `arc materialize ${candidate.name} --here`, argv: ["arc", "materialize", candidate.name, "--here"], checkout: input.entry.cwd },
    { text: "arc user pull", argv: ["arc", "user", "pull"] },
  ], then: { kind: "recompile", argv: buildAgendaArgv(input.signals, input.answers, { dropNext: true }) } }));
}
