/** Compile explicit Start target reads before the agent-owned readiness assessment. */
import type { AgendaCompileInput } from "./compile-input.js";
import { compileConcurrentWorkload } from "./advisories.js";
import { compileCheckoutFreshness } from "./context.js";
import { compileCheckoutSessionOrientation, orderOrientationSurfaces } from "./orientation.js";
import { createSessionInitAgenda } from "./document.js";
import { compileSyncPrefix } from "./prefix.js";
import { compileUniversalReads } from "./reads.js";
import { carryAgendaAnswers } from "./progress.js";
import { resolveAgendaStartTarget } from "./start-target.js";
import { compileStartRecordArguments } from "./start-records.js";
import type { AgendaStep, SessionInitAgenda } from "./schema.js";

/** Start either compiles readiness or supplies a note before ordinary entering-row compilation. */
export type StartSignalResult = { ok: true; agenda: SessionInitAgenda } | { ok: false; note: Extract<AgendaStep, { type: "note" }> };

/** Resolve the target without acquiring remote state or starting the work unit. */
export async function compileStartSignal(input: AgendaCompileInput): Promise<StartSignalResult> {
  const target = await resolveAgendaStartTarget(input, input.signals.start ?? "");
  if (target.kind !== "resolved") return { ok: false, note: { type: "note", surface: "start-target",
    text: target.kind === "refused" ? `${target.refusal.condition}\n${target.refusal.remedy.text}` : target.reason } };
  const orientation = { shape: "subject", subject: { kind: "work-unit", key: target.slug } } as const;
  const prefix = compileSyncPrefix(input, "notes");
  if (prefix.at(-1)?.type === "exec") return { ok: true, agenda: createSessionInitAgenda(input, orientation, carryAgendaAnswers(input, prefix)) };
  const paths = target.storeEvidence === undefined ? [target.metaPath, ...(target.taskListPath === null ? [] : [target.taskListPath])] : [];
  const surfaces = compileCheckoutSessionOrientation(input, "notes", { start: true });
  const freshness = await compileCheckoutFreshness(input);
  if (freshness !== null) surfaces.push({ id: freshness.surface, steps: [freshness] });
  const workload = compileConcurrentWorkload(input);
  if (workload !== null) surfaces.push({ id: workload.surface, steps: [workload] });
  const steps: AgendaStep[] = [...prefix, ...await compileUniversalReads(input, paths.map(path => ({ path, readMode: { kind: "full" } }))),
    ...orderOrientationSurfaces(surfaces),
    { type: "fragment", target: { kind: "method", name: "assess-start-readiness" }, args: {
      slug: target.slug, metaPath: target.metaPath, ...(target.taskListPath === null ? {} : { taskListPath: target.taskListPath }),
      ...(target.storeEvidence === undefined ? {} : compileStartRecordArguments(target.storeEvidence)),
    } }, { type: "gate", kind: "launch", autoProceed: false }];
  return { ok: true, agenda: createSessionInitAgenda(input, orientation, carryAgendaAnswers(input, steps)) };
}
