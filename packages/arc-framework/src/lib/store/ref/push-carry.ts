/** Capture code publication separately from the selected state repository and its retries. */

import { pushRefs, type PushRefChange, type PushOutcome } from "../../git/push.js";
import { classifyPushOutcome } from "../../git/push-classification.js";
import type { CarryOutcome, CarryRefusal, PushInput } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation } from "./designation.js";
import { refSyncDeadlineExpired } from "./sync-deadline.js";
import { observeRefCarryCommitRace } from "./push-carry-race.js";

/** One immutable code tip and its independent, once-settled disposition. */
export interface RefCarryPublication {
  source: RefBackendContext;
  change: PushRefChange;
  remote: string | null;
  outcome?: CarryOutcome;
  /** An unresolved commit failure waits for the state loop's own observation. */
  unattributed?: string;
}

/** Capture the code tip in the code repository, never in a separate state object database. */
export async function captureRefCarry(context: RefBackendContext, input: PushInput["carry"]): Promise<RefCarryPublication | undefined> {
  if (!input) return undefined;
  const source = context.repository?.source ?? context;
  const designation = await readRefDesignation(source);
  const remote = designation.remotes.find(({ name, repository }) => name === designation.codeRemote && repository === "code")?.name ?? null;
  const carry: RefCarryPublication = { source, remote, change: { ref: input.ref, next: null, expected: input.expect } };
  if (!remote) {
    carry.outcome = { ref: input.ref, status: "refused", reason: "no-push-destination", message: "This clone has no code push destination." };
    return carry;
  }
  carry.change.next = (await source.exec("git", ["rev-parse", "--verify", `${input.ref}^{commit}`],
    { cwd: source.checkoutRoot, objectAccess: "local-only" })).stdout.trim();
  return carry;
}

/** Join only the code repository's own state receiver; separate stores use an ordered code leg. */
export async function pushRefListingWithCarry(context: RefBackendContext, remote: string, target: string,
  changes: readonly PushRefChange[], carry: RefCarryPublication | undefined): Promise<PushOutcome> {
  const together = carry && !carry.outcome && carry.remote === remote && !context.repository?.gitDir;
  if (carry && !carry.outcome && !together) await finishRefCarry(carry);
  const outcome = await pushRefs(context.exec, target, [...changes, ...together ? [carry.change] : []],
    { cwd: context.checkoutRoot, signal: context.syncDeadline?.signal });
  if (together && await settleCombinedCarry(carry, outcome)) return pushRefs(context.exec, target, changes,
    { cwd: context.checkoutRoot, signal: context.syncDeadline?.signal });
  return outcome;
}

async function settleCombinedCarry(carry: RefCarryPublication, outcome: PushOutcome): Promise<boolean> {
  if (outcome.status === "atomic-unsupported") { await finishRefCarry(carry); return true; }
  const ambiguous = outcome.status === "refs" && outcome.refs.some((row) => "reason" in row && row.reason === "atomic transaction failed");
  if (ambiguous) {
    const message = [outcome.stdout, outcome.stderr].filter(Boolean).join("\n");
    carry.outcome = await observeRefCarryCommitRace(carry, message);
    if (!carry.outcome) carry.unattributed = message;
    return Boolean(carry.outcome);
  }
  carry.outcome = await ownCarryOutcome(carry, outcome);
  return carry.outcome?.status === "refused" || carry.outcome?.status === "unreachable" && outcome.status === "refs";
}

/** Publish a remaining code leg even when state stopped, while retaining the operation's deadline. */
export async function finishRefCarry(carry: RefCarryPublication): Promise<CarryOutcome> {
  if (carry.outcome) return carry.outcome;
  if (!carry.remote) throw new Error("A pending code publication has no push destination");
  if (refSyncDeadlineExpired(carry.source)) return carry.outcome = { ref: carry.change.ref, status: "unreachable", cause: "timeout" };
  if (carry.unattributed) return carry.outcome = { ref: carry.change.ref, status: "refused", reason: "remote-rejected", message: carry.unattributed };
  const outcome = await pushRefs(carry.source.exec, carry.remote, [carry.change],
    { cwd: carry.source.checkoutRoot, signal: carry.source.syncDeadline?.signal });
  carry.outcome = await ownCarryOutcome(carry, outcome)
    ?? { ref: carry.change.ref, status: "refused", reason: "remote-rejected", message: outcome.stderr || outcome.stdout || "The code push was refused." };
  return carry.outcome;
}

async function ownCarryOutcome(carry: RefCarryPublication, outcome: PushOutcome): Promise<CarryOutcome | undefined> {
  const row = outcome.status === "refs" ? outcome.refs.find(({ ref }) => ref === carry.change.ref) : undefined;
  if (row && "reason" in row && (row.reason === "failed to update ref" || row.reason === "atomic transaction failed")) {
    const observed = await observeRefCarryCommitRace(carry, [outcome.stdout, outcome.stderr].filter(Boolean).join("\n"));
    if (observed) return observed;
  }
  return classifyRefCarry(carry.change.ref, outcome);
}

function classifyRefCarry(ref: string, outcome: PushOutcome): CarryOutcome | undefined {
  if (outcome.status === "unreachable") return { ref, status: "unreachable", cause: outcome.cause };
  const message = [outcome.stdout, outcome.stderr].filter(Boolean).join("\n") || "The code push was refused.";
  if (outcome.status === "hook-declined") return { ref, status: "refused", reason: "hook-declined", message };
  if (outcome.status !== "refs") return undefined;
  const row = outcome.refs.find((row) => row.ref === ref);
  if (row?.status === "ok") return { ref, status: "pushed" };
  if (!row || !("reason" in row) || row.reason === "atomic transaction failed") return undefined;
  const reasons: Record<string, CarryRefusal> = { "non-fast-forward": "non-fast-forward", "fetch first": "fetch-first", "stale info": "stale-info" };
  const knownRace = row.status === "remote-rejected" && classifyPushOutcome({ ...outcome, refs: [row] }).status === "lost-race";
  const reason = reasons[row.reason] ?? (knownRace ? "raced" : "remote-rejected");
  return { ref, status: "refused", reason, message };
}
