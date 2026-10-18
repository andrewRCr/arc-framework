/** Exact Git ranges supply advisory sizes and per-round change signals. */
import { afterEach, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, execFileAsync, makeGitExec } from "../helpers/integration.js";
import { createLocalContinuationFixture } from "../fixtures/local-review-continuation.js";
import { approvedRecord } from "../fixtures/review-response-proof.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { LaneProgressState } from "../../src/scripts/review-gate/core/operation-state-schema.js";
import { recordLaneResponsePerformance } from "../../src/scripts/review-gate/lane-progress.js";
import { deriveNextPassFacts } from "../../src/scripts/review-gate/policy/next-pass-facts.js";
import { deriveReviewNextPassContext } from "../../src/scripts/review-gate/policy/review-next-pass.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });

it("measures the fix separately from the contribution and observes files added outside cited loci", async () => {
  const cwd = await createTempRepo("arc-next-pass-facts-"); roots.push(cwd);
  const git = async (...args: string[]) => (await execFileAsync("git", args, { cwd })).stdout.trim();
  await mkdir(join(cwd, "src"));
  await writeFile(join(cwd, "src/example.ts"), "export const value = 1;\n");
  await git("add", "."); await git("commit", "-m", "base");
  const base = await git("rev-parse", "HEAD");
  await writeFile(join(cwd, "src/example.ts"), "export const value = 2;\n");
  await writeFile(join(cwd, "src/feature.ts"), "export const feature = true;\n");
  await git("add", "."); await git("commit", "-m", "reviewed contribution");
  const reviewed = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: "repo-1", baseRef: "main", diffBaseSha: base, diffBaseTree: await git("rev-parse", `${base}^{tree}`),
    headSha: await git("rev-parse", "HEAD"), headTree: await git("rev-parse", "HEAD^{tree}") });
  const fixture = await createLocalContinuationFixture("whole-target", "Light", reviewed);
  await fixture.conclude(fixture.original, "clean");
  const root = await fixture.resultReader.readResult(fixture.original.operationId);
  if (root.kind === "frontline") throw new Error("expected standard review");
  await writeFile(join(cwd, "src/example.ts"), "export const value = 3;\n");
  await writeFile(join(cwd, "src/new.ts"), "export const extra = true;\n");
  await git("add", "."); await git("commit", "-m", "plain successor");
  const { targetId, ...coordinates } = reviewed; void targetId;
  const target = createReviewTarget({ ...coordinates, headSha: await git("rev-parse", "HEAD"),
    headTree: await git("rev-parse", "HEAD^{tree}") });
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = root.requirement;
  const nextPassContext = await deriveReviewNextPassContext({ completePasses: 1, predecessor: root, currentTarget: target,
    currentLineage: root.admission.lineage, standardReview: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count },
    resultReader: fixture.resultReader, dispositionStore: { readDispositionRecord: async () => null,
      appendDispositionRecord: async () => { throw new Error("Read-only context"); } }, readResponsePerformance: async () => null,
    rangeProof: { cwd, exec: makeGitExec(cwd) }, deltaAdmission: { sources: ["delegated-agent"], surface: "ordinary" } });
  const owner = fixture.laneProgress();
  if (owner?.kind !== "lane-progress") throw new Error("expected lane owner");
  const facts = await deriveNextPassFacts({ progress: [owner], dispositions: [], nextPassContext,
    target, ceiling: 4, exec: createRawGitExec(cwd) });
  expect(facts).toMatchObject({ chainProven: true, rangeSize: {
    target: { kind: "known", metrics: { files: 3, lines: 4 } },
    fix: { kind: "known", metrics: { files: 2, lines: 3 } },
  } });

  const fixFixture = await createLocalContinuationFixture("whole-target", "Light", reviewed);
  await fixFixture.conclude(fixFixture.original, "findings");
  const producer = await fixFixture.resultReader.readResult(fixFixture.original.operationId);
  const record = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const performed: LaneProgressState = await recordLaneResponsePerformance(fixFixture.dependencies.operationStore,
    { lane: "standard", repositoryId: producer.repositoryId, lineage: producer.admission.lineage,
      headSha: reviewed.headSha, attemptId: producer.producerId, dispositionSetId: record.currentDispositionSetId,
      producedHeadSha: target.headSha, now: "2026-10-18T00:00:00Z" });
  const observed = await deriveNextPassFacts({ progress: [performed], dispositions: [record],
    nextPassContext: { completePasses: 1, convergence: "unconverged", responseDue: false, incremental: null },
    target, ceiling: 4, exec: createRawGitExec(cwd) });
  expect(observed.fixRounds).toMatchObject([{ dispositionSetId: record.currentDispositionSetId,
    originatingHeadSha: reviewed.headSha, producedHeadSha: target.headSha, outsideCitedLoci: true, addedFiles: true }]);
}, 30_000);
