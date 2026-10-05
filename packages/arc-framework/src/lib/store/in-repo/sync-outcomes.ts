/** Map producer-owned publication facts onto the storage contract's outcomes. */
import { ArcError } from "../../kernel/errors.js";
import type { RemotePublicationFailure } from "../../git/publication-failure.js";
import type { NotesPushOutcome } from "../../../commands/user/push-fetch.js";
import type { ErrandPushOutcome } from "../../errand/merge.js";
import type { SyncResult } from "../sync.js";
import type { FamilyId } from "../catalog.js";
import type { StoreRefusal } from "../refusal.js";

type Publish = SyncResult["publishes"][number];
/** Translate one notes publish, preserving local failures as thrown errors.
 * @param outcome - Existing producer's result with boundary-owned failure facts.
 * @param waitedMs - Elapsed injected-clock time.
 * @returns The personal-files publication result.
 */
export function notesPublish(outcome: NotesPushOutcome, waitedMs: number): Publish {
  const families: FamilyId[] = ["personal"];
  if (["pushed", "noop", "reconciled"].includes(outcome.kind)) return { status: outcome.kind as "pushed" | "noop" | "reconciled", families };
  if (outcome.kind === "no-local-notes") return { status: "noop", families };
  if (outcome.kind === "failed" || outcome.kind === "no-remote") {
    if (outcome.remoteFailure === undefined) throw new ArcError(outcome.error?.message ?? "Notes publication returned no remote failure facts", "store.sync-failed", { cause: outcome.error });
    return failed(families, outcome.remoteFailure, waitedMs);
  }
  const status = outcome.kind === "refused" ? outcome.reason : outcome.kind;
  const condition = outcome.kind === "blocked" ? outcome.conditions.map((entry) => entry.guidance).join("; ")
    : outcome.kind === "conflict" || outcome.kind === "refused" ? outcome.message : "Notes publication could not complete.";
  return { status, families, condition, remedy: { text: "Repair the reported notes condition, then run arc sync again." } };
}
/** Translate the independent Errand and claims publish.
 * @param outcome - Existing identity-ref producer's result.
 * @param waitedMs - Elapsed injected-clock time.
 * @returns The two-family publication result.
 */
export function transientPublish(outcome: ErrandPushOutcome, waitedMs: number): Publish {
  const families: FamilyId[] = ["work-item", "claims"];
  if (outcome.kind === "pushed" || outcome.kind === "noop" || outcome.kind === "reconciled") return { status: outcome.kind, families };
  if (outcome.kind === "conflict") return { status: "conflict", families, condition: `Identity records conflict: ${outcome.slugs.join(", ")}`,
    remedy: { text: "Hand repair the conflicting ref entries to agree before running arc sync again." } };
  if (outcome.remoteFailure === undefined) throw new ArcError(outcome.error?.message ?? "Identity publication returned no remote failure facts", "store.sync-failed", { cause: outcome.error });
  return failed(families, outcome.remoteFailure, waitedMs);
}
function failed(families: FamilyId[], detail: RemotePublicationFailure, waitedMs: number): Publish {
  const remedy = { text: "Repair the remote connection or rejection, then retry this publish with arc sync." };
  let failure: Extract<StoreRefusal, { code: "unreachable" | "refused" | "retries-exhausted" }>;
  if (detail.code === "unreachable") failure = { ...detail, class: "recoverable", condition: "The configured remote could not be reached.", remedy };
  else if (detail.code === "refused") failure = { ...detail, class: "terminal", condition: detail.message, remedy };
  else failure = { ...detail, class: "recoverable", condition: "Concurrent remote writes exhausted the bounded retries.", waitedMs, remedy };
  return { status: "failed", families, failure };
}
