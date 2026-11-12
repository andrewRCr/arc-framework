/** Candidate responses export stored designs after recording performance, including resumed exports. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { respondToReviewCommand } from "../../../../../src/scripts/review-gate/runtime/respond-command.js";
import { exportWorkUnitSpec } from "../../../../../src/lib/work-unit/design-export.js";
import { recordReferences } from "../../../../../src/lib/store/identity.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { withReviewReport } from "../../../../fixtures/review-report-input.js";
import { fixture, lineageDependencies, verifiedFixRequest, objectId, candidateSubject,
  candidateLineageBinding, memberVehicle, errandVehicle, dependencies, localRequest, activeErrandBinding } from "../../../../fixtures/respond-command.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";

it.each(["perform", "replay"] as const)("re-exports a changed stored design on %s after performance", async mode => {
  const records = fixture(), current = { revision: objectId("e"), subject: candidateSubject("fixed") };
  const { deps, appends } = lineageDependencies(records, current);
  const h = createReviewHarness(), primary = await h.seedMeta("example");
  await h.seed(recordReferences["work-item/spec"](primary.reference.owner), "# Stored design\n");
  const cwd = await mkdtemp(join(tmpdir(), "arc-response-export-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const path = ".arc/specs/example/spec-example.md", absolute = join(cwd, path);
  let performed = false;
  const recordPerformance = deps.recordResponsePerformance;
  deps.recordResponsePerformance = async input => { await recordPerformance(input); performed = true; };
  let allowStage = true;
  deps.exportCandidateDesign = async workUnit => {
    if (!performed) throw new Error("Design export preceded performance");
    return exportWorkUnitSpec({ cwd, workUnit, store: h.store, owner: primary.reference.owner,
      trackDesignDocs: "specs", exec: async () => {
        if (!allowStage) throw new Error("Matching replay staged a copy");
        return { stdout: "" };
      } });
  };
  const request = withReviewReport(verifiedFixRequest(records));
  if (mode === "replay") {
    await respondToReviewCommand(request, deps);
    const advanced = appends[0]?.record;
    if (advanced === undefined) throw new Error("Expected a performed response");
    deps.readCandidateLineage = async () => candidateLineageBinding(records, advanced, current);
  }
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, "# Hand-edited copy\n");
  const result = await respondToReviewCommand(request, deps);
  expect(result.state).toBe(mode === "perform" ? "candidate-advanced" : "candidate-current");
  expect(result.diagnostics).toEqual([{ code: "design-exported",
    message: `Re-exported ${path}, replacing the existing copy with the stored specification.` }]);
  expect(await readFile(absolute, "utf8")).toBe("# Stored design\n");
  const advanced = appends[0]?.record;
  if (advanced === undefined) throw new Error("Expected a performed response");
  deps.readCandidateLineage = async () => candidateLineageBinding(records, advanced, current);
  allowStage = false;
  expect((await respondToReviewCommand(request, deps)).diagnostics).toEqual([]);
  expect(appends).toHaveLength(1);
});

it("does not export a Candidate-bound delivery member's design", async () => {
  const records = fixture(memberVehicle);
  const { deps } = lineageDependencies(records, { revision: objectId("e"), subject: candidateSubject("fixed") });
  deps.confirmTarget = async target => ({ state: "current", target });
  deps.exportCandidateDesign = async () => { throw new Error("Delivery member exported a spec"); };
  expect(await respondToReviewCommand(withReviewReport(verifiedFixRequest(records)), deps))
    .toMatchObject({ state: "candidate-advanced", diagnostics: [] });
});

it("does not export an Errand's design", async () => {
  const records = fixture(errandVehicle), deps = dependencies(records);
  deps.readCandidateLineage = async () => null;
  deps.resolveActiveErrand = async () => activeErrandBinding();
  deps.exportCandidateDesign = async () => { throw new Error("Errand exported a spec"); };
  expect(await respondToReviewCommand(withReviewReport(localRequest(records)), deps)).toMatchObject({ state: "ready-to-fix" });
  const currentTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: records.target.repositoryId, baseRef: "main", diffBaseSha: objectId("a"), diffBaseTree: objectId("b"),
    headSha: objectId("e"), headTree: objectId("f") });
  deps.confirmTarget = async target => ({ state: "stale-target", attemptedTarget: target, currentTarget });
  expect(await respondToReviewCommand(withReviewReport(verifiedFixRequest(records)), deps))
    .toMatchObject({ state: "errand-advanced", diagnostics: [] });
});
