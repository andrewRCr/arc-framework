/** Recovery decisions consume the producer's recommendation and proven destination facts. */
import type { CascadeCandidate, SessionInitRecoveryValue } from "../../lib/session-init/branch-gone-cascade.js";
import { agendaQuestionKey, buildAgendaArgv } from "./argv.js";
import type { AgendaCompileInput } from "./compile-input.js";
import type { RecoveryDestination } from "./recovery-destinations.js";
import type { AgendaStep, OfferChoice } from "./schema.js";

/** Facts and recorded progress needed to decide a recovery action. */
export interface RecoveryDecisionInput extends Pick<AgendaCompileInput, "signals" | "answers"> {
  recovery: SessionInitRecoveryValue | null;
  destinations: readonly RecoveryDestination[];
}

/** Compile a recovery instruction without re-reading dirty state or other probes. */
export function compileRecoveryDecision(input: RecoveryDecisionInput): AgendaStep | null {
  const { recovery } = input;
  if (recovery === null) return null;
  const id = agendaQuestionKey("branch-gone", recovery.kind);
  if (input.answers.done.includes(id) || input.answers.answered[id] !== undefined) return null;
  if ((recovery.kind === "resolved" && recovery.candidate.proposedAction === "switch" && recovery.candidate.branch === "-")
    || (recovery.kind === "main-fallback" && recovery.baseBranch === "-")) return null;
  if (recovery.kind === "resolved" && recovery.candidate.proposedAction === "switch"
    && recovery.recommendedAction === "switch") {
    const destination = input.destinations.find(value => value.branch === recovery.candidate.branch);
    return destination?.kind === "free" ? { type: "exec", id, actions: destination.actions, then: recompile(input) } : null;
  }
  if (recovery.recommendedAction !== "prompt") return null;
  const choices = promptChoices(input, id);
  if (choices.length === 0) return null;
  return { type: "offer", id, ask: "now", text: recovery.recommendedPromptText, choices: [
    ...choices, { kind: "bare", label: "Stay here", decline: true },
  ] };
}

function promptChoices(input: RecoveryDecisionInput, id: string): OfferChoice[] {
  const recovery = input.recovery;
  if (recovery?.kind === "pending") return [{ kind: "actions", label: recovery.refreshRemedy.text,
    accepts: [id], actions: [recovery.refreshRemedy], then: recompile(input) }];
  const candidates: CascadeCandidate[] = recovery?.kind === "resolved" ? [recovery.candidate]
    : recovery?.kind === "surface" ? recovery.candidates
      : recovery?.kind === "main-fallback" ? [{ branch: recovery.baseBranch, proposedAction: "switch" }] : [];
  return candidates.map(candidate => candidateChoice(input, candidate, id)).filter(choice => choice !== null);
}

function candidateChoice(input: RecoveryDecisionInput, candidate: CascadeCandidate, id: string): OfferChoice | null {
  if (candidate.proposedAction === "switch") {
    return switchChoice(input, input.destinations.find(value => value.branch === candidate.branch), id);
  }
  if (candidate.proposedAction === "external") return { kind: "bare", label: `Recover manually in checkout ${candidate.worktreePath}` };
  const action = input.recovery?.actions?.find(value => value.argv?.[0] === "arc"
    && value.argv[1] === "teardown" && value.argv[2] === candidate.workUnitName);
  return action?.argv === undefined ? null : { kind: "actions", label: action.text, accepts: [id],
    actions: [{ ...action, argv: action.argv }], then: recompile(input) };
}

function switchChoice(input: RecoveryDecisionInput, destination: RecoveryDestination | undefined, id: string): OfferChoice | null {
  if (destination?.branch === "-") return { kind: "bare", label: "Recover the literal branch - manually" };
  if (destination === undefined || destination.kind === "unavailable" || destination.kind === "manual") return null;
  return destination.kind === "free"
    ? { kind: "actions", label: `Switch to ${destination.branch}`, accepts: [id], actions: destination.actions, then: recompile(input) }
    : { kind: "bare", label: `Continue in checkout ${destination.checkoutPath}` };
}

function recompile(input: RecoveryDecisionInput): Extract<AgendaStep, { type: "exec" }>["then"] {
  return { kind: "recompile", argv: buildAgendaArgv(input.signals, input.answers) };
}
