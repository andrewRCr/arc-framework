/** Resume selected transient activities without allocating or rediscovering their checkout. */
import type { DerivedCheckoutSubject } from "../../lib/locus/role-derivation.js";
import { transientWorkflow } from "../../lib/recover/locus-context.js";
import type { AgendaCompileInput } from "./compile-input.js";
import { createSessionInitAgenda } from "./document.js";
import { compileCheckoutSessionOrientation, orderOrientationSurfaces } from "./orientation.js";
import { compileSyncPrefix } from "./prefix.js";
import { carryAgendaAnswers } from "./progress.js";
import { compileUniversalReads } from "./reads.js";
import type { AgendaStep, SessionInitAgenda } from "./schema.js";

/** Enter the owning workflow from the exact selected transient role and marker generation. */
export async function compileTransientResume(input: AgendaCompileInput): Promise<SessionInitAgenda> {
  const frame = input.envelope.derivedLocusState;
  if (!frame.ok || frame.value.entering.kind !== "selected" || frame.value.entering.row.kind !== "transient") {
    throw new Error("Transient resume requires a selected transient checkout");
  }
  const row = frame.value.entering.row;
  const selected = row.subject;
  if (selected.kind === "work-unit") throw new Error("Transient resume requires a transient subject");
  const subject = { kind: selected.kind, key: selected.key };
  const orientation = { shape: "subject" as const, subject };
  const prefix = compileSyncPrefix(input);
  if (prefix.at(-1)?.type === "exec") return createSessionInitAgenda(input, orientation, carryAgendaAnswers(input, prefix));
  return createSessionInitAgenda(input, orientation, carryAgendaAnswers(input, [
    ...prefix, ...await compileUniversalReads(input),
    ...orderOrientationSurfaces(compileCheckoutSessionOrientation(input)),
    compileTransientFragment(selected, row.markerGeneration),
  ]));
}

/** Preserve transient entry arguments, including an unavailable marker generation. */
export function compileTransientFragment(subject: Exclude<DerivedCheckoutSubject, { kind: "work-unit" }>, generation: string | null): AgendaStep {
  const workflow = transientWorkflow(subject);
  return { type: "fragment", target: { kind: "workflow", path: workflow.path }, args: {
    subjectKind: subject.kind, subjectKey: subject.key, generation, ...(workflow.name === "run-errand" ? { mode: "resume" } : {}),
  } };
}
