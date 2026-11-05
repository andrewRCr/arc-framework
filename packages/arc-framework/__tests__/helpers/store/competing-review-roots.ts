/** Producer-generated independent approvals retained by a real two-clone merge. */
import { refSyncFixture } from "./ref-sync.js";
import { bindNativeReviewPorts } from "./native-review-ports.js";
import { success } from "./suite-tools.js";
import { makeGitExec } from "../integration.js";
import { localOutcome, frontlineOutcome, hostedOutcome } from "../../fixtures/review-outcome.js";
import { reviewEvidenceFixture } from "../../fixtures/review-evidence.js";
import { createHostedHandleFixture } from "../../fixtures/hosted-review.js";
import { RecordReferenceSchema, type Store } from "../../../src/lib/store/index.js";
import { createProjectIdentityReader } from "../../../src/lib/store/project-identity.js";
import { renderMetaFile } from "../../../src/lib/store/kinds/meta/writers.js";
import { RepositoryGitCommonStatePublisher } from "../../../src/lib/git-common-state.js";
import { ReviewOutcomeSchema } from "../../../src/lib/store/kinds/review/outcome/schema.js";
import { composeReviewDispositionRecord } from "../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { publishNativeReviewApproval } from "../../../src/scripts/review-gate/runtime/native-review-approval.js";

/** Seed one producer before each clone independently approves a different response. */
export async function competingReviewRoots(layout: "default" | "separate", source: "local" | "frontline" | "hosted" = "local") {
  const f = await refSyncFixture(layout);
  const projectId = "34567890-1234-4234-8234-123456789abc";
  const provenance = { verb: "seed", lifecycleAction: "create" };
  success(await f.a.store.write({ action: "put", expected: null, provenance,
    reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
    content: JSON.stringify({ projectId }) }));
  const meta = success(await f.a.store.write({ action: "put", expected: null, placement: { kind: "active" },
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "example" } }),
    content: renderMetaFile("example", { state: "Active", owner: "test-user", workClass: "Light", currentWorkflow: "process-task-loop" }),
    provenance: { verb: "start", lifecycleAction: "activate" } }));
  const owner = meta.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected an exact work-item generation");
  const bind = (store: Store, root: string) => ({ ...bindNativeReviewPorts({ store, owner,
    publisher: new RepositoryGitCommonStatePublisher(makeGitExec(root), root), projectId: createProjectIdentityReader(store) }),
    readProjectId: createProjectIdentityReader(store), now: () => "2026-10-30T12:01:00Z" });
  const a = bind(f.a.store, f.a.root), b = bind(f.b.store, f.b.root);
  const target = createHostedHandleFixture({ repositoryId: projectId }).admission.reviewTarget;
  const findings = [{ findingId: "finding-1", severity: "major" as const,
    locus: "src/example.ts:1", evidenceUrlOrId: "finding-1", sourceOrdinal: 1 }];
  const outcome = ReviewOutcomeSchema.parse(source === "hosted" ? hostedOutcome({ repositoryId: projectId,
    outcome: "findings", findings: [{ findingId: "finding-1",
      severity: "major", sourceOrdinal: 1, origin: "review-thread", commentId: "comment-1", threadId: "thread-1",
      settlement: "reply-and-resolve", locus: "src/example.ts:1", url: "https://example.invalid/thread-1" }] })
    : source === "frontline" ? frontlineOutcome({ target, findings })
      : localOutcome({ target, outcome: "findings", vehicle: { kind: "work-unit", identity: "example" }, findings }));
  await a.outcomes.create(outcome);
  const seedState = (await f.a.git(["rev-parse", `refs/arc/work/${owner.uid}`])).stdout.trim();
  success(await f.a.store.push());
  success(await f.b.store.pull());
  const fix = await publishNativeReviewApproval({ ...a,
    record: composeReviewDispositionRecord(outcome, [reviewEvidenceFixture(outcome, "fix")], owner) });
  const defer = await publishNativeReviewApproval({ ...b,
    record: composeReviewDispositionRecord(outcome, [reviewEvidenceFixture(outcome, "defer")], owner) });
  success(await f.a.store.push());
  const merged = success(await f.b.store.pull());
  return { ...f, owner, outcome, fix, defer, merged, seedState, nativeA: a, nativeB: b };
}
