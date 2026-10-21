/** Conditional response decisions retain the invocation's native approved fix. */
import { expect, it, onTestFinished } from "vitest";
import { createNativeConditionalPassFixture } from "../../../../fixtures/native-conditional-pass.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { createRespondDependencies } from "../../../../../src/scripts/review-gate/runtime/respond-composition.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { candidateRecordFixture } from "../../../../fixtures/review-candidate.js";
import { readCandidateRecord } from "../../../../../src/lib/store/kinds/review/candidate/access.js";
import { recordReferences } from "../../../../../src/lib/store/identity.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

it("exports the invocation Store's spec through the response composition", async () => {
  const h = createReviewHarness(), primary = await h.seedMeta("example");
  await h.seed(recordReferences["work-item/spec"](primary.reference.owner), "# Selected specification\n");
  const path = ".arc/specs/example/spec-example.md";
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["add", "--", path], responses: [{ stdout: "" }] },
  ] });
  onTestFinished(checkout.cleanup);
  const dependencies = createRespondDependencies({ cwd: checkout.cwd, exec: checkout.exec,
    store: h.store, workItem: primary.reference.owner, projectId: h.projectId });
  expect(await dependencies.exportCandidateDesign?.("example")).toEqual({ path, overwritten: false });
  expect(await readFile(join(checkout.cwd, path), "utf8")).toBe("# Selected specification\n");
});

it("withdraws conditional authority against the supplied Store's current approved fix", async () => {
  const f = await createNativeConditionalPassFixture("frontline");
  const checkout = await createReviewCheckout(f.h);
  onTestFinished(checkout.cleanup);
  const dependencies = createRespondDependencies({ cwd: checkout.cwd, exec: checkout.exec,
    store: f.h.store, workItem: f.primary.reference.owner, projectId: f.input.readProjectId });
  const { now: ignored, ...source } = f.input.capture;
  void ignored;
  const captured = await dependencies.captureConditionalNextPass(source);
  expect(await dependencies.withdrawConditionalNextPass({ ...source,
    authorizationId: captured.authorizationId, withdrawnBy: source.authorizedBy })).toMatchObject({ state: "withdrawn" });
});

it.each(["append", "replay"] as const)("persists a native Candidate response on %s without staging a record", async mode => {
  const h = createReviewHarness(), { record } = candidateRecordFixture();
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "feat/example", linkedAs: "adopted", excluded: [] }],
  });
  const before = mode === "append" ? { ...record, transitions: [], lineageAttestations: [] } : record;
  const saved = await h.seedCandidate(primary.reference.owner, before);
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  await checkout.occupy("feat/example", { kind: "work-unit", name: "example" });
  const dependencies = createRespondDependencies({ cwd: checkout.cwd, exec: checkout.exec,
    store: h.store, workItem: primary.reference.owner, projectId: h.projectId });
  if (mode === "append") await dependencies.appendCandidateResponse({ workUnit: "example", record, expectedRecordVersion: saved.version });
  else await dependencies.stageCandidateResponse("example");
  expect(await readCandidateRecord(checkout.cwd, "example", { store: h.store, owner: primary.reference.owner })).toEqual(record);
});
