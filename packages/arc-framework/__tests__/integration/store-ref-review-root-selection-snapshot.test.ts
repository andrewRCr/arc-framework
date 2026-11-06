/** Review authority retains one manifest while live selectors change between dependent reads. */
import { expect, it } from "vitest";
import { competingReviewRoots } from "../helpers/store/competing-review-roots.js";
import { success } from "../helpers/store/suite-tools.js";
import { runReviewRootRepair } from "../../src/lib/store/review-root-repair.js";
import { createReviewEvidencePort } from "../../src/lib/store/kinds/review/evidence/access.js";
import { createReviewResponsePort } from "../../src/lib/store/kinds/review/evidence-root-selection/responses.js";
import type { Store } from "../../src/lib/store/contract.js";
import type { ListInput } from "../../src/lib/store/read.js";
import type { OwnerIdentity } from "../../src/lib/store/identity.js";
import { publishNativeReviewPerformance } from "../../src/scripts/review-gate/runtime/native-review-performance.js";

type Reader = "composed-key" | "composed-list" | "native-key" | "native-list";
const cases = (["default", "separate"] as const).flatMap(layout =>
  (["composed-key", "composed-list", "native-key", "native-list"] as const).map(reader => ({ layout, reader })));

it.each(cases)("keeps $reader authority at its original manifest ($layout)", async ({ layout, reader }) => {
  const f = await competingReviewRoots(layout);
  await choose(f, f.defer.value.dispositionSet.dispositionSetId);
  let moved = false;
  const anchor = reader.startsWith("composed") ? "review/evidence" : "review/outcome";
  const store = new Proxy(f.b.store, { get(target, key) {
    if (key === "list") return async (input: ListInput) => {
      const result = await target.list(input);
      if (!moved && input.kind === anchor) {
        moved = true;
        await choose(f, f.fix.value.dispositionSet.dispositionSetId);
      }
      return result;
    };
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } }) satisfies Store;
  expect(await selectedId(store, f.owner, f.outcome.attemptId, reader)).toBe(f.defer.value.dispositionSet.dispositionSetId);
  expect(moved).toBe(true);
  expect(await selectedId(f.b.store, f.owner, f.outcome.attemptId, reader)).toBe(f.fix.value.dispositionSet.dispositionSetId);
}, 120_000);

it.each(cases)("refuses invalid $reader authority captured before a concurrent repair ($layout)", async ({ layout, reader }) => {
  const f = await competingReviewRoots(layout);
  await choose(f, f.defer.value.dispositionSet.dispositionSetId);
  const record = await f.nativeA.evidence.readDispositionRecord(f.outcome.attemptId);
  if (record === null) throw new Error("Expected the independent offline approval");
  await publishNativeReviewPerformance({ ...f.nativeA, record, performance: { schemaVersion: 1,
    producerId: f.outcome.attemptId, dispositionSetId: f.fix.value.dispositionSet.dispositionSetId,
    originatingHeadSha: f.outcome.target.headSha, producedHeadSha: "e".repeat(40), performedAt: "2026-11-03T10:02:00Z" } });
  success(await f.a.store.push());
  success(await f.b.store.pull());
  let repaired = false;
  const anchor = reader.startsWith("composed") ? "review/evidence" : "review/outcome";
  const store = new Proxy(f.b.store, { get(target, key) {
    if (key === "list") return async (input: ListInput) => {
      const result = await target.list(input);
      if (!repaired && input.kind === anchor) {
        repaired = true;
        await choose(f, f.fix.value.dispositionSet.dispositionSetId);
      }
      return result;
    };
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } }) satisfies Store;
  await expect(selectedId(store, f.owner, f.outcome.attemptId, reader)).rejects.toMatchObject({
    refusal: { code: "record-malformed", rule: "review.evidence-root-selection.policy" } });
  expect(repaired).toBe(true);
  expect(await selectedId(f.b.store, f.owner, f.outcome.attemptId, reader)).toBe(f.fix.value.dispositionSet.dispositionSetId);
}, 120_000);

it.each((["default", "separate"] as const).flatMap(layout =>
  (["local", "frontline"] as const).map(source => ({ layout, source }))))(
  "reads an immutable $source result despite unresolved response roots ($layout)", async ({ layout, source }) => {
  const f = await competingReviewRoots(layout, source);
  expect(await f.nativeB.responses.read(f.outcome.attemptId, "producer-result"))
    .toEqual({ status: "found", outcome: expect.objectContaining({ value: f.outcome }), authority: "not-requested" });
  await expect(f.nativeB.responses.read(f.outcome.attemptId, "authority")).rejects.toMatchObject({
    refusal: { code: "record-malformed", rule: "review.evidence.root" } });
  await f.a.git(["update-ref", `refs/arc/work/${f.owner.uid}`, f.seedState]);
  expect(await f.nativeA.responses.read(f.outcome.attemptId, "authority"))
    .toEqual({ status: "found", outcome: expect.objectContaining({ value: f.outcome }), authority: "loaded", evidence: [] });
}, 120_000);

async function choose(f: Awaited<ReturnType<typeof competingReviewRoots>>, selectedRoot: string): Promise<void> {
  const request = { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId };
  const preview = success(await runReviewRootRepair({ store: f.b.store, request, now: () => "2026-11-03T10:00:00Z" }));
  if (preview.state !== "preview-ready") throw new Error("Expected an explicit choice");
  success(await runReviewRootRepair({ store: f.b.store, now: () => "2026-11-03T10:00:01Z", request: { ...request,
    operation: "apply", basis: preview.basis, selectedRoot, decidedBy: "andrew", reason: "Continue the chosen branch." } }));
}

async function selectedId(store: Store, owner: OwnerIdentity, producerId: string, reader: Reader): Promise<string | undefined> {
  const evidence = createReviewEvidencePort(store, owner), responses = createReviewResponsePort(store, owner);
  if (reader === "composed-key") return (await evidence.readDispositionRecord(producerId))?.currentDispositionSetId;
  if (reader === "composed-list") return (await evidence.listDispositionRecords())[0]?.currentDispositionSetId;
  if (reader === "native-list") return (await responses.list()).evidence.at(-1)?.value.dispositionSet.dispositionSetId;
  const response = await responses.read(producerId, "authority");
  return response.status === "found" ? response.evidence.at(-1)?.value.dispositionSet.dispositionSetId : undefined;
}
