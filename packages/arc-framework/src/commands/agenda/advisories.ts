/** Render-only reminders and in-flight work advisories with exact nudge data. */
import type { NudgeMarkerState } from "../../lib/session-init/nudge-rate-limit.js";
import type { WorkUnitStateResult } from "../../lib/session-init/work-unit-state.js";
import type { AgendaCompileInput } from "./compile-input.js";
import type { OrientationSurface } from "./orientation.js";
import type { AgendaStep } from "./schema.js";

type Render = Extract<AgendaStep, { type: "render" }>;

/** Compile advisory surfaces; discovery callers opt into the workload note. */
export function compileAdvisoryOrientation(input: AgendaCompileInput, options: { concurrentWorkload?: boolean } = {}): OrientationSurface[] {
  const reminder = reminderSurface(input);
  const inFlight = inFlightSurface(input);
  const workload = options.concurrentWorkload ? compileConcurrentWorkload(input) : null;
  return [reminder, inFlight, workload].flatMap(step => step === null ? [] : [{ id: step.surface, steps: [step] }]);
}

function reminderSurface(input: AgendaCompileInput): Render | null {
  const sweep = input.envelope.errandSweep, state = input.envelope.errandState;
  if (!sweep?.ok || !state?.ok || sweep.value.stale.length === 0 || !state.value.nudge.shouldNudge) return null;
  const { nudge } = state.value;
  return { type: "render", surface: "reminder",
    text: `**Reminder:** ${sweep.value.stale.length} flagged capture(s) pending past the reminder threshold — drain via \`arc-housekeep\`:\n`
      + sweep.value.stale.map(item => `- \`${item.slug}\` — created ${item.created} (${item.ageDays}d ago)`).join("\n"),
    ...advisoryMarker(nudge) };
}


function inFlightSurface(input: AgendaCompileInput): Render | null {
  const slot = input.envelope.workUnitState;
  if (!slot?.ok) return null;
  const { inFlight, nudge } = slot.value;
  const reports = inFlight.workUnits.filter(report => report.state !== "stale" || nudge.shouldNudge);
  if (reports.length === 0) return null;
  return { type: "render", surface: "in-flight-work-units",
    text: [`**Work units in flight:** ${reports.length} owned WU(s) in the completion tail:`, ...reports.map(inFlightReportText)].join("\n"),
    ...(reports.some(report => report.state === "stale") ? advisoryMarker(nudge) : {}) };
}

function inFlightReportText(report: WorkUnitStateResult["inFlight"]["workUnits"][number]): string {
  const lines = [`- \`${report.branch}\` — ${report.state} (${report.ageDays}d)`];
  const guidance = new Set<string>();
  if (report.state === "mergeability-unavailable") guidance.add(report.mergeabilityGuidance);
  if (report.state === "mergeable" && report.behindBase.status === "known" && report.behindBase.value) guidance.add("  - merge the base in first");
  if (report.state === "merged-needs-archival") guidance.add("  - archive it");
  for (const action of report.actions ?? []) guidance.add(action.text);
  return [...lines, ...guidance].join("\n");
}

function advisoryMarker(nudge: NudgeMarkerState): Pick<Render, "marker"> {
  return nudge.markerPath === null ? {} : { marker: { path: nudge.markerPath, value: nudge.today } };
}


/** Render the workload advisory without enabling reminders or completion-tail guidance. */
export function compileConcurrentWorkload(input: AgendaCompileInput): Extract<AgendaStep, { type: "note" }> | null {
  const composition = input.envelope.inFlightComposition;
  if (composition === undefined || (composition.heavy === 0 && composition.novel === 0)) return null;
  const classes = [composition.novel > 0 ? `${composition.novel} Novel` : null,
    composition.heavy > 0 ? `${composition.heavy} Heavy` : null].filter(value => value !== null).join(" / ");
  return { type: "note", surface: "concurrent-workload",
    text: `**Concurrent workload:** heavier work is already in flight (${classes}). ARC scales concurrency to the attention you can give it — consider a lighter next pick, or take on more heavier work deliberately.` };
}
