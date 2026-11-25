/** Stale Errand guidance follows actual approval state and changed coordinates without accepting a stale response. */
import { expect, it } from "vitest";
import { activeErrandBinding, dependencies, errandVehicle, fixture, localRequest } from "../../../../fixtures/respond-command.js";
import { withReviewReport } from "../../../../fixtures/review-report-input.js";
import { nativeListingRefusal } from "../../../../fixtures/native-refusal.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { ApprovedDispositionRecordSchema, currentApprovedDispositionNode } from "../../../../../src/scripts/review-gate/core/advisory-records.js";
import { respondToReviewCommand } from "../../../../../src/scripts/review-gate/runtime/respond-command.js";

function scenario(disposition: "fix" | "defer" = "fix") {
  const lineage = { kind: "head-bound" as const, vehicleKind: "errand" as const,
    vehicleIdentity: errandVehicle.claimId, headSha: "c".repeat(40) };
  const records = fixture(errandVehicle, undefined, lineage), deps = dependencies(records);
  deps.resolveActiveErrand = async () => activeErrandBinding();
  deps.readCandidateLineage = async () => null;
  const rawRequest = localRequest(records, disposition, "full"), request = withReviewReport(rawRequest);
  const verifiedRequest = () => withReviewReport({ ...rawRequest,
    verifiedFix: { applicability: "full", verificationEvidenceRefs: ["test://full"] } });
  const { schemaVersion, semanticsVersion, kind, repositoryId, baseRef, diffBaseSha, diffBaseTree, headSha, headTree } = records.target;
  const input = { schemaVersion, semanticsVersion, kind, repositoryId, baseRef, diffBaseSha, diffBaseTree, headSha, headTree };
  const head = createReviewTarget({ ...input, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  const move = (target = head) => { deps.confirmTarget = async () => ({ state: "stale-target", attemptedTarget: records.target, currentTarget: target }); };
  const restore = () => { deps.confirmTarget = async () => ({ state: "current", target: records.target }); };
  const respond = () => respondToReviewCommand(request, deps);
  const read = () => deps.dispositionStore.readDispositionRecord(records.operation.operationId);
  return { records, deps, request, verifiedRequest, input, head, move, restore, respond, read };
}

it("directs an already-approved committed fix to the supported verified-fix replay without rewriting approval", async () => {
  const s = scenario();
  expect((await s.respond()).state).toBe("ready-to-fix");
  const before = await s.read();
  s.move();
  const stopped = await s.respond();
  expect(stopped).toMatchObject({ state: "stale-target", nextAction: "stop" });
  if (stopped.state !== "stale-target" || stopped.nextAction !== "stop") throw new Error("expected stop");
  expect(stopped.payload.detail).toContain("already recorded");
  expect(stopped.payload.detail).toContain("verifiedFix");
  expect(stopped.payload.detail).not.toContain("restore this same Errand branch");
  expect(await s.read()).toEqual(before);
  const performed = await respondToReviewCommand(s.verifiedRequest(), s.deps);
  expect(performed.state).toBe("errand-advanced");
});

it("keeps a recorded non-fix response distinct from missing approval and retries at the restored target", async () => {
  const s = scenario("defer");
  expect((await s.respond()).state).toBe("settled");
  const before = await s.read(); s.move();
  const stopped = await s.respond();
  if (stopped.state !== "stale-target" || stopped.nextAction !== "stop") throw new Error("expected stop");
  expect(stopped.payload.detail).toContain("already recorded");
  expect(stopped.payload.detail).not.toContain("No approved response exists");
  expect(stopped.payload.detail).not.toContain("with verifiedFix");
  expect(await s.read()).toEqual(before);
  s.restore();
  expect((await s.respond()).state).toBe("already-settled");
});

it("does not offer another fix consumption after the approved fix was already performed", async () => {
  const s = scenario(); await s.respond(); s.move();
  await respondToReviewCommand(s.verifiedRequest(), s.deps);
  const before = await s.read(), stopped = await s.respond();
  if (stopped.state !== "stale-target" || stopped.nextAction !== "stop") throw new Error("expected stop");
  expect(stopped.payload.detail).toContain("already recorded");
  expect(stopped.payload.detail).not.toContain("with verifiedFix");
  expect(await s.read()).toEqual(before);
});

it("keeps an interrupted approval projection recorded and permits its ordinary replay after repair", async () => {
  const s = scenario(), resolve = s.deps.resolvePolicy.bind(s.deps);
  s.deps.resolvePolicy = async () => { throw new Error("projection interrupted"); };
  await expect(s.respond()).rejects.toThrow("projection interrupted");
  const before = await s.read();
  if (before === null) throw new Error("expected saved approval");
  expect(currentApprovedDispositionNode(before).policyProjectionPending).toBe(true);
  s.move();
  const stopped = await s.respond();
  if (stopped.state !== "stale-target" || stopped.nextAction !== "stop") throw new Error("expected stop");
  expect(stopped.payload.detail).toContain("already recorded");
  expect(stopped.payload.detail).not.toContain("with verifiedFix");
  expect(await s.read()).toEqual(before);
  s.deps.resolvePolicy = resolve; s.restore();
  expect((await s.respond()).state).toBe("ready-to-fix");
  const repaired = await s.read();
  if (repaired === null) throw new Error("expected approval");
  expect(currentApprovedDispositionNode(repaired).policyProjectionPending).toBeUndefined();
});

it.each([null, activeErrandBinding("claim-2")])("preserves an incompatible saved Errand binding (%j) without calling it missing", async errand => {
  const s = scenario(); await s.respond();
  const before = await s.read();
  if (before === null) throw new Error("expected saved approval");
  const incompatible = ApprovedDispositionRecordSchema.parse({ ...before, errand });
  s.deps.dispositionStore.readDispositionRecord = async () => incompatible; s.move();
  const stopped = await s.respond();
  if (stopped.state !== "stale-target" || stopped.nextAction !== "stop") throw new Error("expected stop");
  expect(stopped.payload.detail).toContain("does not match");
  expect(stopped.payload.detail).not.toContain("No approved response exists");
  expect(stopped.payload.detail).not.toContain("with verifiedFix");
  expect(await s.read()).toEqual(incompatible);
});

it("preserves a typed record-read refusal and continues after its read and target are repaired", async () => {
  const s = scenario(), read = s.deps.dispositionStore.readDispositionRecord.bind(s.deps.dispositionStore), refusal = nativeListingRefusal();
  s.deps.dispositionStore.readDispositionRecord = async () => { throw refusal; }; s.move();
  await expect(s.respond()).rejects.toBe(refusal);
  s.deps.dispositionStore.readDispositionRecord = read; s.restore();
  expect((await s.respond()).state).toBe("ready-to-fix");
  expect((await s.read())?.errand).toEqual(activeErrandBinding());
});

it.each([false, true])("names actual base coordinates when head drift is %s, and records only after restoration", async headMoved => {
  const s = scenario();
  const current = createReviewTarget({ ...(headMoved ? { ...s.input, headSha: s.head.headSha, headTree: s.head.headTree } : s.input),
    diffBaseSha: s.records.target.headSha, diffBaseTree: s.records.target.headTree });
  s.move(current);
  const stopped = await s.respond();
  if (stopped.state !== "stale-target" || stopped.nextAction !== "stop") throw new Error("expected stop");
  expect(stopped.payload.detail).toContain("diffBaseSha");
  expect(stopped.payload.detail).toContain("diffBaseTree");
  expect(stopped.payload.detail).toContain("reviewed base context");
  expect(stopped.payload.detail).not.toContain("restore this same Errand branch");
  expect(await s.read()).toBeNull();
  s.restore();
  expect((await s.respond()).state).toBe("ready-to-fix");
});
