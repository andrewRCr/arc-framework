/** Orient on a contextless current husk while retaining its existing cleanup limits. */
import type { AgendaCompileInput } from "./compile-input.js";
import { createSessionInitAgenda } from "./document.js";
import { compileSessionOrientation, orderOrientationSurfaces } from "./orientation.js";
import { compileSyncPrefix } from "./prefix.js";
import { carryAgendaAnswers } from "./progress.js";
import { compileUniversalReads } from "./reads.js";
import type { SessionInitAgenda } from "./schema.js";

/** Synchronize before rendering the husk and stop without entering work-unit execution. */
export async function compileCurrentHusk(input: AgendaCompileInput): Promise<SessionInitAgenda> {
  const orientation = { shape: "work-state" as const };
  const prefix = compileSyncPrefix(input);
  if (prefix.at(-1)?.type === "exec") return createSessionInitAgenda(input, orientation, carryAgendaAnswers(input, prefix));
  return createSessionInitAgenda(input, orientation, carryAgendaAnswers(input, [
    ...prefix, ...await compileUniversalReads(input),
    ...orderOrientationSurfaces(compileSessionOrientation(input, [], undefined, {})),
    { type: "gate", kind: "stop", autoProceed: false },
  ]));
}
