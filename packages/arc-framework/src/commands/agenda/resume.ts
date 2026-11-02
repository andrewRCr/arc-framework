/** Compile a work-unit resume through synchronization, context and orientation. */
import type { AgendaCompileInput } from "./compile-input.js";
import { compileCheckoutOrientation } from "./checkout.js";
import { compileSyncState } from "./sync-state.js";
import { compileResumeContext } from "./context.js";
import { createSessionInitAgenda } from "./document.js";
import { compileNotesOrientation } from "./notes.js";
import { compileSyncPrefix } from "./prefix.js";
import { carryAgendaAnswers } from "./progress.js";
import { canAutoProceed, compileCoreOrientation, orderOrientationSurfaces } from "./orientation.js";
import type { SessionInitAgenda } from "./schema.js";

/** End at a pending mutation or compile the selected work unit's current context. */
export async function compileWorkUnitResume(input: AgendaCompileInput): Promise<SessionInitAgenda> {
  const prefix = compileSyncPrefix(input);
  if (prefix.at(-1)?.type === "exec") return createSessionInitAgenda(input, { shape: "work-state" }, carryAgendaAnswers(input, prefix));
  const context = await compileResumeContext(input);
  const reads = context.steps.filter(step => step.type === "read");
  const findings = context.steps.filter(step => step.type === "render" || step.type === "note");
  const sync = compileSyncState(input);
  const orientation = orderOrientationSurfaces([...compileCoreOrientation(input, findings, sync), ...compileCheckoutOrientation(input, sync), ...compileNotesOrientation(input, sync)]);
  const steps = [...prefix, ...reads, ...orientation];
  return createSessionInitAgenda(input, { shape: "work-state" }, carryAgendaAnswers(input, [
    ...steps, { type: "gate", kind: "proceed", autoProceed: canAutoProceed(input, steps, context.metaContent) },
  ]));
}
