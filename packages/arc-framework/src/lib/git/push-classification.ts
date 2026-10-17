/** Classify state-push rejections while preserving causal refs and complete diagnostics. */

import type { RemoteFailureReason } from "../kernel/index.js";
import type { PushOutcome, PushRefOutcome } from "./push.js";

/** A ref carrying its own cause, rather than an atomic collateral report. */
export interface PushRejectionCause { ref: string; disposition: "lost-race" | "by-state" | "refused"; reason: string }
/** An unrecognized server refusal needs a fresh state observation before it becomes terminal. */
export type PushClassification = { message: string } & (
  | { status: "ok" }
  | { status: "lost-race" | "by-state"; causes: PushRejectionCause[] }
  | { status: "refused"; reason: "rejected" | "hook-declined" | "atomic-unsupported"; causes: PushRejectionCause[] }
  | { status: "unreachable"; cause: RemoteFailureReason }
);

/** Classify parsed push evidence without guessing whether unknown server text describes a race. */
export function classifyPushOutcome(outcome: PushOutcome): PushClassification {
  const message = [outcome.stdout, outcome.stderr].filter(Boolean).join("\n");
  if (outcome.status === "unreachable") return { status: "unreachable", cause: outcome.cause, message };
  if (outcome.status !== "refs") return { status: "refused", reason: outcome.status, causes: [], message };
  const causes = outcome.refs.flatMap((row) => "reason" in row ? [classifyRefCause(row)] : []);
  if (causes.some(({ disposition }) => disposition === "refused")) return { status: "refused", reason: "rejected", causes, message };
  if (causes.some(({ disposition }) => disposition === "by-state")
    || causes.length === 0 && outcome.refs.some(({ status }) => status === "atomic-collateral")) return { status: "by-state", causes, message };
  return causes.length > 0 ? { status: "lost-race", causes, message } : { status: "ok", message };
}

const clientRaces = new Set(["non-fast-forward", "fetch first", "stale info"]);
const serverRaces = /(?:cannot lock ref|incorrect old value provided|reference already exists|reference does not exist|\bTF401028\b)/u;

function classifyRefCause(row: Extract<PushRefOutcome, { reason: string }>): PushRejectionCause {
  const disposition = row.status === "rejected" ? clientRaces.has(row.reason) ? "lost-race" : "refused"
    : serverRaces.test(row.reason) ? "lost-race" : "by-state";
  return { ref: row.ref, disposition, reason: row.reason };
}
