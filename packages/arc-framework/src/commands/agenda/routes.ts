/** Standing discovery routes over published materialization commands. */
import { basename } from "node:path";
import { SlugSchema } from "../../lib/kernel/index.js";
import { resolveArcPath } from "../../lib/layout/index.js";
import type { SessionAction } from "../../lib/session-init/actions.js";
import { compileLegacyMaterializeChoices } from "./legacy-materialize.js";
import { renderDegradedSlot } from "./render.js";
import { agendaQuestionKey, buildAgendaArgv } from "./argv.js";
import type { AgendaCompileInput } from "./compile-input.js";
import type { OrientationSurface } from "./orientation.js";
import type { AgendaStep, OfferChoice } from "./schema.js";

/** Request facts needed to return from a standing route. */
export type AgendaRouteContext = Pick<AgendaCompileInput, "signals" | "answers"> & {
  entry: Pick<AgendaCompileInput["entry"], "cwd">;
};
/** A published command rather than text-only guidance. */
export type AgendaRouteCommand = SessionAction & { argv: readonly string[] };

/** Preserve a published command and select its continuation from operation and checkout. */
export function compileRouteChoice(input: AgendaRouteContext, action: AgendaRouteCommand): Extract<OfferChoice, { kind: "actions" }> {
  const argv = action.argv;
  const release = argv[0] === "arc" && argv[1] === "locus" && argv[2] === "release";
  const materialize = argv[0] === "arc" && (argv[1] === "materialize" || (argv[1] === "errand" && argv[2] === "materialize"));
  const elsewhere = action.checkout !== undefined && action.checkout !== input.entry.cwd;
  const handoff = !release && (argv.includes("--here") ? elsewhere : materialize);
  return { kind: "actions", label: action.text, accepts: [], actions: [{ ...action, argv: [...argv] }],
    then: handoff ? { kind: "handoff" } : { kind: "recompile", argv: buildAgendaArgv(input.signals, input.answers, { dropNext: true }) } };
}

/** Compile standing discovery menus without invoking their commands. */
export function compileOrientRoutes(input: AgendaCompileInput): OrientationSurface[] {
  return [...workUnitRoutes(input), ...errandRoutes(input), ...housekeepRoutes(input)];
}

function workUnitRoutes(input: AgendaCompileInput): OrientationSurface[] {
  const slot = input.envelope.materializableWorkUnits;
  const degraded = renderDegradedSlot("materializableWorkUnits", slot);
  if (degraded !== null) return [{ id: "degraded-slot", steps: [degraded] }];
  if (!slot?.ok || (slot.value.candidates.length === 0 && slot.value.refreshRemedy === null)) return [];
  const candidates = slot.value.candidates;
  const text = [`**Materializable work units:** ${candidates.length} remote WU(s) available:`,
    ...candidates.map(item => `- \`${item.name}\`${item.branch === undefined ? "" : ` (\`${item.branch}\`)`} — materialize and resume?`)].join("\n");
  const choices: OfferChoice[] = candidates.flatMap(item => item.actions ?? []).flatMap(action => action.argv === undefined ? []
    : [compileRouteChoice(input, { ...action, argv: action.argv })]);
  choices.push(...compileLegacyMaterializeChoices(input, candidates));
  if (slot.value.refreshRemedy !== null) choices.push(compileRouteChoice(input, slot.value.refreshRemedy));
  const refresh = slot.value.refreshRemedy === null ? "" : `\n${slot.value.refreshRemedy.text}`;
  return [routeSurface("materializable-work-units", text + refresh,
    agendaQuestionKey("materialize", candidates.map(item => item.name).sort().join(",")), "Materialize and resume a work unit?", choices)];
}

function errandRoutes(input: AgendaCompileInput): OrientationSurface[] {
  const slot = input.envelope.errandState;
  if (!slot?.ok || slot.value.materializable.candidates.length === 0) return [];
  const candidates = slot.value.materializable.candidates;
  const text = [`**Materializable Errands:** ${candidates.length} remote Errand generation(s) available:`,
    ...candidates.map(item => `- \`${item.slug}\` (\`${item.branch}\` at \`${item.expectedHead}\`, \`${item.state}\`) — materialize and resume?`)].join("\n");
  const choices = candidates.flatMap(item => item.actions ?? []).flatMap(action => action.argv === undefined ? []
    : [compileRouteChoice(input, { ...action, argv: action.argv })]);
  return [routeSurface("materializable-errands", text, agendaQuestionKey("materialize-errand", candidates.map(item => item.slug).sort().join(",")),
    "Materialize and resume an Errand?", choices)];
}

function housekeepRoutes(input: AgendaCompileInput): OrientationSurface[] {
  const frame = input.envelope.derivedLocusState;
  if (!frame.ok || frame.value.entering.kind !== "selected" || !frame.value.entering.row.checkout.primary) return [];
  const slot = input.envelope.inboxState;
  const degraded = renderDegradedSlot("inboxState", slot);
  if (degraded !== null) return [{ id: "degraded-slot", steps: [degraded] }];
  if (!slot?.ok || !slot.value.housekeepNeeded) return [];
  const inbox = basename(resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity: SlugSchema.parse(input.entry.identity ?? "identity") } }), ".md");
  return [{ id: "housekeep", steps: [{ type: "offer", id: agendaQuestionKey("housekeep", "drain"), ask: "orientation",
    text: `**Housekeep:** no active WU; \`${inbox}\` has ${slot.value.routableCount} pending capture(s) — housekeep?`,
    choices: [{ kind: "signal", label: "Housekeep", signal: "housekeep", value: true,
      recompile: buildAgendaArgv(input.signals, input.answers, { signal: { signal: "housekeep", value: true }, dropNext: true }) }],
  }] }];
}

function routeSurface(surface: string, text: string, id: string, prompt: string, choices: OfferChoice[]): OrientationSurface {
  const steps: AgendaStep[] = [{ type: "render", surface, text }];
  if (choices.length > 0) steps.push({ type: "offer", id, ask: "orientation", text: prompt, choices });
  return { id: surface, steps };
}
