/** Advisory pass headers with opaque artifact versions and unstructured evaluator prose. */
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { RecordVersionSchema } from "../../src/lib/store/identity.js";

export const adversarialActivities = ["draft-readiness", "spec-finalization", "task-generation", "design-amendment", "verification", "criteria"] as const;
export function adversarialPassFixture(activity: typeof adversarialActivities[number] = "draft-readiness") {
  const version = RecordVersionSchema.parse("artifact-version-1");
  const artifacts = activity === "draft-readiness" ? { draft: version } : activity === "spec-finalization" ? { spec: version }
    : { spec: version, taskList: version };
  return { schemaVersion: 1, activity, artifacts,
    ...(activity === "criteria" || activity === "verification" ? { codeHead: "a".repeat(40) } : {}),
    rubric: { version: "planning/v1", digest: canonicalDigest({ rubric: "planning" }) }, pass: { number: 1, cap: 2 },
    approvedBy: "andrew", approvedAt: "2026-10-19T13:00:00Z", stopReason: "converged", overCapApproval: null,
    dispositions: [{ findingId: "F1", action: "defer", account: "A source-grounded account.\nAny evaluator prose is retained." }],
    report: "An evaluator's report.\n## With arbitrary Markdown" };
}
