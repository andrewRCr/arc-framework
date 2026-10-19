/** Boundary-bearing outputs accept the stored format without relaxing either persisted version. */
import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { SessionInitProbeResultSchema } from "../../../../../src/commands/status/schema.js";
import { projectCandidateReviewBoundary } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { boundaryLoci, boundaryV1Fixture, boundaryV2Fixture } from "../../../../fixtures/review-boundary.js";
import { ActiveSessionInitResultSchema } from "../../../../../src/commands/active/schema.js";
import { AttestResultSchema } from "../../../../../src/lib/work-unit/verbs/attest.js";

it.each(boundaryLoci)("carries both %s boundary formats through active resolution", locus => {
  for (const boundary of [boundaryV1Fixture(locus), boundaryV2Fixture(locus)]) {
    const input = { mode: "session-init", layout: "full", resolution: "single", path: ".arc/active/meta-example.md",
      candidates: [], sessionType: "integration", currentWorkflow: "integrate-work-unit", planningStage: null,
      integrationBoundary: boundary, warnings: [] };
    expect(ActiveSessionInitResultSchema.parse(input)).toEqual(input);
  }
});

it.each(boundaryLoci.flatMap(locus => ["unchanged", "root", "convergence"].map(operation => ({ locus, operation }))))(
  "carries both $locus boundary formats through $operation attestation", ({ locus, operation }) => {
    for (const boundary of [boundaryV1Fixture(locus), boundaryV2Fixture(locus)]) {
      const input = operation === "unchanged" ? { status: "unchanged", locus: boundary }
        : { status: "attested", operation, locus: boundary, recordPath: "candidate.json", metaPath: "meta-example.md",
          ...(operation === "convergence" ? { scope: "full", verificationEvidenceRef: "verification://merge" } : {}) };
      expect(AttestResultSchema.parse(input)).toEqual(input);
    }
  },
);

it.each([1, 2] as const)("carries format %s consistently through the session envelope", async version => {
  const captured = SessionInitProbeResultSchema.parse(JSON.parse(await readFile(new URL(
    "../../../../fixtures/session-envelope/session-init-active-resume.json", import.meta.url), "utf8")));
  if (!captured.active.ok || !captured.derivedLocusState.ok) throw new Error("Expected captured active context");
  const derived = captured.derivedLocusState.value, owned = derived.active;
  if (owned === null || owned.subject.kind !== "work-unit" || derived.entering.kind !== "selected") throw new Error("Expected selected work unit");
  const original = projectCandidateReviewBoundary({ workUnit: owned.subject.key,
    candidateId: `sha256:${"a".repeat(64)}`, candidateSubjectDigest: `sha256:${"b".repeat(64)}` });
  const { policy: ignored, ...fields } = original;
  void ignored;
  const boundary = version === 1 ? original : { ...fields, schemaVersion: 2 };
  const cursor = { status: "no-open-task" };
  const loadSet = { ...owned.context.loadSet, entries: owned.context.loadSet.entries.map(entry =>
    entry.path.endsWith("/process-task-loop.md") ? { ...entry, path: ".arc/system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md" } : entry) };
  const context = { ...owned.context, sessionType: "prepublication", workflow: "prepare-work-unit",
    integrationBoundary: boundary, taskCursor: cursor, workUnitStage: undefined, loadSet };
  const input = { ...captured, taskCursor: { ok: true, value: cursor }, loadSet: { ok: true, value: loadSet },
    active: { ok: true, value: { ...captured.active.value, sessionType: "prepublication", currentWorkflow: "prepare-work-unit", integrationBoundary: boundary } },
    derivedLocusState: { ok: true, value: { ...derived, active: { ...owned, context },
      roster: derived.roster.map(row => row.checkout.path === owned.checkoutPath ? { ...row, context } : row),
      entering: { ...derived.entering, row: { ...derived.entering.row, context } } } } };
  expect(SessionInitProbeResultSchema.parse(input)).toMatchObject({ active: { value: { integrationBoundary: boundary } },
    derivedLocusState: { value: { active: { context: { integrationBoundary: boundary } } } } });
});
