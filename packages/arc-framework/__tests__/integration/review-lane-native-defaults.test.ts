/** The read-only lane handler resolves native checkout authority through production defaults. */
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { writeWorktreeMarker, resolveWorktreeMarkerPath } from "../../src/lib/git/worktree-marker.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { createProjectIdentityReader } from "../../src/lib/store/project-identity.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { IntegrationBoundaryLocusV2Schema } from "../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { handleReviewLaneRead } from "../../src/handlers/review.js";

it.each(["work-unit", "errand"] as const)("reads a native %s through the default handler after identity and vehicle repair", async vehicle => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.standard_sources: [delegated-agent]\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await git("add", ".");
  await git("commit", "-m", "Configure lane reads");
  const base = await git("rev-parse", "HEAD");
  const branch = vehicle === "errand" ? "chore/repair" : "topic/opaque";
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "example.ts"), "export const value = true;\n");
  await git("add", "example.ts");
  await git("commit", "-m", "Implement example");
  const projectId = "123e4567-e89b-42d3-a456-426614174099", claimId = "1".repeat(32);
  const marker = { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-10-20T18:00:00Z",
    ...(vehicle === "errand" ? { provisioning: "ready" as const, createdFor: { kind: "errand" as const, slug: "repair", claimId } }
      : { createdFor: { kind: "work-unit" as const, name: "example" } }) };
  await writeWorktreeMarker(cwd, marker);
  if (vehicle === "errand") {
    const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair",
      claimId, intent: "Repair one issue", owner: "andrew", origin: "description", originEntry: null, branch,
      state: "open", savedHead: null, changeRequest: null, createdAt: marker.createdAt, updatedAt: marker.createdAt });
    if (record.kind !== "errand") throw new Error("Expected Errand");
    await h.reference.seedErrand(record);
  } else {
    const primary = await h.reference.seedMeta("example", { owner: "andrew", branch: null }, { kind: "active" }, {
      branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
    });
    const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec });
    if (collected.status !== "collected") throw new Error(collected.detail);
    const attestation = createCandidateAttestation({ workUnit: "example", subject: collected.target.subject,
      baseRevision: base, attestedBy: "andrew", attestedAt: marker.createdAt, verificationEvidenceRef: "test://verified" });
    await h.reference.seedCandidate(primary.reference.owner, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
      attestation, subject: collected.target.subject, transitions: [], lineageAttestations: [] });
    await h.reference.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2,
      mode: "pre-publication-review", workUnit: "example", candidateId: attestation.candidateId,
      candidateSubjectDigest: collected.target.subject.subjectDigest, locus: "candidate-review-pending", reservation: null,
      nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." } }));
  }
  const request = { schemaVersion: 1 };
  const run = async () => {
    let output = "";
    await handleReviewLaneRead("-", { resolveRoot: () => cwd, readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: () => {} }, undefined,
    { store: h.reference.store, projectId: createProjectIdentityReader(h.reference.store) });
    return JSON.parse(output) as unknown;
  };
  const initialVersion = lifecycleSuccess(await h.reference.store.version());
  expect(await run()).toMatchObject({ state: "refused", payload: { code: "project-identity-unavailable",
    remedy: { argv: ["arc", "review", "lane", "read", "-"], stdin: request } } });
  expect(lifecycleSuccess(await h.reference.store.version())).toBe(initialVersion);
  await h.reference.seedProject(projectId);
  const version = lifecycleSuccess(await h.reference.store.version());
  const expected = { state: "ready", payload: { lineage: vehicle === "errand"
    ? { kind: "head-bound", vehicleIdentity: claimId } : { kind: "candidate" }, facts: { completePasses: 0 } } };
  expect(await run()).toMatchObject(expected);
  await unlink(resolveWorktreeMarkerPath(cwd));
  if (vehicle === "work-unit") await git("switch", "-c", "topic/unlinked");
  expect(await run()).toMatchObject({ state: "refused", payload: { code: "vehicle-unresolved" } });
  if (vehicle === "work-unit") await git("switch", branch);
  await writeWorktreeMarker(cwd, marker);
  expect(await run()).toMatchObject(expected);
  expect(lifecycleSuccess(await h.reference.store.version())).toBe(version);
}, 30_000);
