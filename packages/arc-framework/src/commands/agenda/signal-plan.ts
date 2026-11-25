/** Resolve explicit planning intent before entering the drafting workflow. */
import { resolveBacklogStub, type BacklogStub } from "../../lib/work-unit/backlog-stub.js";
import { agendaQuestionKey, buildAgendaArgv } from "./argv.js";
import type { AgendaCompileInput } from "./compile-input.js";
import { createSessionInitAgenda } from "./document.js";
import { compileCheckoutSessionOrientation, orderOrientationSurfaces } from "./orientation.js";
import { compileSyncPrefix } from "./prefix.js";
import { carryAgendaAnswers } from "./progress.js";
import { compileUniversalReads } from "./reads.js";
import type { AgendaOrientation, AgendaStep, SessionInitAgenda } from "./schema.js";

/** Compile planning entry against the selected checkout and operational store. */
export async function compilePlanSignal(input: AgendaCompileInput): Promise<SessionInitAgenda> {
  const requested = typeof input.signals.plan === "string" ? input.signals.plan : "";
  const orientation: AgendaOrientation = { shape: "subject", subject: { kind: "groom", key: requested || null } };
  const prefix = compileSyncPrefix(input, "notes");
  if (prefix.at(-1)?.type === "exec") return createSessionInitAgenda(input, orientation, carryAgendaAnswers(input, prefix));
  const { stub, failure } = await lookupStub(input, requested);
  if (stub !== null) orientation.subject.key = stub.slug;
  const tail: AgendaStep = stub === null ? planPicker(input, requested, failure) : { type: "fragment", target: {
    kind: "workflow", path: ".arc/system/workflows/arc/draft-design.md",
  }, args: { stub: stub.slug, onGroomingBranch: isGroomingBranch(input, stub.slug) } };
  return createSessionInitAgenda(input, orientation, carryAgendaAnswers(input, [
    ...prefix, ...await compileUniversalReads(input),
    ...orderOrientationSurfaces(compileCheckoutSessionOrientation(input, "notes")), tail,
  ]));
}

function planPicker(input: AgendaCompileInput, requested: string, failure: string | null): AgendaStep {
  return { type: "offer", id: agendaQuestionKey("plan-stub", requested), ask: "now",
    text: failure !== null ? `Planning stub lookup for '${requested}' failed: ${failure}`
      : requested === "" ? "Which planning stub should be groomed?"
        : `Planning stub '${requested}' was not found. Choose another stub or continue without planning.`,
    choices: [
      { kind: "elicit", label: "Choose a planning stub", signal: "plan", ...(requested === "" ? {} : { carried: requested }),
        recompile: buildAgendaArgv(input.signals, input.answers, { elicit: "plan" }) },
      { kind: "signal", label: "Continue without planning", signal: "plan", value: null, decline: true,
        recompile: buildAgendaArgv(input.signals, input.answers, { signal: { signal: "plan", value: null } }) },
    ] };
}

function isGroomingBranch(input: AgendaCompileInput, stub: string): boolean {
  const frame = input.envelope.derivedLocusState;
  return frame.ok && frame.value.entering.kind === "selected"
    && frame.value.entering.row.checkout.branch === `chore/groom-${stub}`;
}

async function lookupStub(input: AgendaCompileInput, requested: string): Promise<{ stub: BacklogStub | null; failure: string | null }> {
  try {
    return { stub: await resolveBacklogStub(input.entry.cwd, requested, input.entry.store), failure: null };
  } catch (error) {
    return { stub: null, failure: error instanceof Error ? error.message : String(error) };
  }
}
