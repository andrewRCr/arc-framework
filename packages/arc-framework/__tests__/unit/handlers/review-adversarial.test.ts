/** Adversarial recording preserves caller input and derives durable coordinates. */
import { ReviewAdversarialRecordRequestSchema } from "../../../src/scripts/review-gate/core/adversarial-record-schema.js";
import { expect, it } from "vitest";
import { handleReviewAdversarialRecord } from "../../../src/handlers/review-adversarial.js";
import { createStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { ReviewCommandErrorEnvelopeSchema } from "../../../src/scripts/review-gate/core/review-command-envelope.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { recordKey } from "../../helpers/store/model.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import type { ReviewInvocationOptions } from "../../../src/scripts/review-gate/runtime/invocation.js";
import { adversarialPassFixture } from "../../fixtures/review-adversarial-pass.js";
import type { Store } from "../../../src/lib/store/contract.js";

function request(activity: Parameters<typeof adversarialPassFixture>[0] = "draft-readiness") {
  const { artifacts, codeHead, ...header } = adversarialPassFixture(activity);
  void artifacts; void codeHead;
  return { ...header, workUnit: "example" };
}
async function record(store: Store, input: unknown, invocation: ReviewInvocationOptions = {}, raw?: string) {
  let output = "", exitCode = 0;
  await handleReviewAdversarialRecord("-", { resolveRoot: () => "/test", readText: () => Promise.resolve(raw ?? JSON.stringify(input)),
    write: text => { output += text; }, setExitCode: code => { exitCode = code; } }, undefined, { store, ...scriptGitExec([]), ...invocation });
  return { envelope: JSON.parse(output), exitCode };
}
it.each(["draft-readiness", "verification", "criteria"] as const)("refuses %s before the flip with its text-only remedy", async activity => {
  const store = createStore(createDefaultStorePorts({ checkoutRoot: "/test" }));
  const result = await record(store, request(activity));
  expect(result.exitCode).toBe(1);
  expect(result.envelope).toMatchObject({ schemaVersion: 1, mode: "review-adversarial-record", diagnostics: [], error: { code: "unsupported" },
    remedy: { text: expect.stringContaining(activity === "draft-readiness" ? "ADVERSARIAL-PASSES.md" : "criteria report") } });
  expect(Object.keys(result.envelope.remedy)).toEqual(["text"]);
  expect(ReviewCommandErrorEnvelopeSchema.safeParse(result.envelope).success).toBe(true);
  expect(ReviewCommandErrorEnvelopeSchema.safeParse({ ...result.envelope, mode: "review-resolve" }).success).toBe(false);
});

async function nativeFixture() {
  const h = createReviewHarness(), primary = await h.seedMeta("example");
  const draft = await h.seed(recordReferences["work-item/draft"](primary.reference.owner), "# Draft\n\nA reviewed draft.\n");
  const spec = await h.seed(recordReferences["work-item/spec"](primary.reference.owner), "# Spec\n\nA reviewed specification.\n");
  const tasks = await h.seed(recordReferences["work-item/task-list"](primary.reference.owner), "# Tasks\n\n### `[ ]` **1.1 Implement behavior**\n\n- _Goal:_ Implement it.\n");
  return { ...h, primary, draft, spec, tasks };
}
it("records exact artifact versions, numbering each activity across loops", async () => {
  const h = await nativeFixture();
  for (const activity of ["draft-readiness", "spec-finalization", "task-generation", "design-amendment"] as const) {
    for (let number = 1; number <= 2; number++) {
      const before = lifecycleSuccess(await h.store.version());
      const result = await record(h.store, request(activity));
      expect(result.exitCode, JSON.stringify(result.envelope)).toBe(0);
      const key = { activity, number };
      expect(result.envelope).toMatchObject({ mode: "review-adversarial-record", state: "recorded", nextAction: "none", payload: { key } });
      const saved = lifecycleSuccess(await h.store.read({ reference: recordReferences["review/adversarial-pass"](h.primary.reference.owner, key) }));
      const value = JSON.parse(saved.content);
      expect(result.envelope.payload.version).toEqual(saved.version);
      expect(value).toMatchObject({ ...adversarialPassFixture(activity), artifacts: activity === "draft-readiness"
        ? { draft: h.draft.version } : activity === "spec-finalization" ? { draft: h.draft.version, spec: h.spec.version }
        : { spec: h.spec.version, taskList: h.tasks.version } });
      expect(value).not.toHaveProperty("codeHead");
      expect(value.pass.number).toBe(1);
      expect(lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) })))
        .toEqual([expect.objectContaining({ reference: saved.reference, version: saved.version })]);
    }
  }
});

it.each(["duplicate finding", "missing over-cap approval"] as const)("rejects a %s before publication", async kind => {
  const h = await nativeFixture(), base = request();
  const bad = kind === "duplicate finding" ? { ...base, dispositions: [...base.dispositions, ...base.dispositions] }
    : { ...base, pass: { number: 3, cap: 2 } };
  expect(ReviewAdversarialRecordRequestSchema.safeParse(bad).success).toBe(false);
  expect(await record(h.store, bad)).toMatchObject({ exitCode: 1, envelope: { error: { code: "invalid-input", message: expect.stringContaining("--schema") } } });
  const repaired = kind === "duplicate finding" ? base : { ...bad, overCapApproval: { approvedBy: "andrew", approvedAt: "2026-10-20T19:00:00Z" } };
  expect(await record(h.store, repaired)).toMatchObject({ exitCode: 0, envelope: { payload: { key: { number: 1 } } } });
});

it("refuses an unresolved slug and records on its exact generation after repair", async () => {
  const h = await nativeFixture(), input = { ...request(), workUnit: "missing" }, before = await h.store.version();
  expect(await record(h.store, input)).toMatchObject({ exitCode: 1, envelope: { error: { code: "invalid-input", message: expect.stringMatching(/missing|not found|resolve/iu) } } });
  expect(await h.store.version()).toEqual(before);
  const primary = await h.seedMeta("missing");
  await h.seed(recordReferences["work-item/draft"](primary.reference.owner), "# Draft\n\nThe named unit's draft.\n");
  const result = await record(h.store, input);
  expect(result).toMatchObject({ exitCode: 0, envelope: { payload: { key: { activity: "draft-readiness", number: 1 } } } });
  expect(lifecycleSuccess(await h.store.read({ reference: recordReferences["review/adversarial-pass"](primary.reference.owner, result.envelope.payload.key) })).reference.owner)
    .toEqual(primary.reference.owner);
  expect(lifecycleSuccess(await h.store.list({ family: "review", owner: h.primary.reference.owner }))).toMatchObject({ status: "absent" });
});
it.each(["unreadable", "diagnostic"] as const)("refuses an %s listing and continues after repair", async kind => {
  const h = await nativeFixture(), input = request();
  const first = await record(h.store, input);
  expect(first.exitCode).toBe(0);
  const reference = recordReferences["review/adversarial-pass"](h.primary.reference.owner, first.envelope.payload.key);
  if (kind === "unreadable") h.store.state.unreadable.add("review");
  else h.store.state.faults.set(recordKey(reference), { reference, kind: "malformed" });
  const before = await h.store.version();
  expect(await record(h.store, input)).toMatchObject({ exitCode: 1, envelope: { error: { code: "corrupt-state", message: expect.stringMatching(/restore|repair/iu) } } });
  expect(await h.store.version()).toEqual(before);
  h.store.state.unreadable.clear(); h.store.state.faults.clear();
  expect(await record(h.store, input)).toMatchObject({ exitCode: 0, envelope: { payload: { key: { number: 2 } } } });
});
it("names the expected request shape for malformed JSON and resumes with valid input", async () => {
  const h = await nativeFixture(), before = await h.store.version();
  for (const raw of ["{", "{}", JSON.stringify({ ...request(), artifacts: { draft: "forged" } })]) {
    expect(await record(h.store, null, {}, raw)).toMatchObject({ exitCode: 1, envelope: { error: { code: "invalid-input", message: expect.stringContaining("arc review adversarial record --schema") } } });
    expect(await h.store.version()).toEqual(before);
  }
  expect(ReviewAdversarialRecordRequestSchema.safeParse(request()).success).toBe(true);
  expect(await record(h.store, request())).toMatchObject({ exitCode: 0 });
});
it.each([
  { code: "lock-held" as const, envelope: "store-refused" },
  { code: "record-malformed" as const, envelope: "invalid-input" },
])("reports a $code write refusal as $envelope and records once repaired", async ({ code, envelope }) => {
  const h = await nativeFixture(), write = h.store.write.bind(h.store), input = request();
  const refusal = code === "lock-held"
    ? { code, class: "recoverable" as const, lock: "review", condition: "The review lock is held.",
      remedy: { text: "Wait for the holder to finish, then retry.", argv: ["arc", "store", "pull"] } }
    : { code, class: "recoverable" as const, rule: "review.adversarial-pass.findings", condition: "The pass repeats a finding.",
      remedy: { text: "Correct the approved pass, then retry." } };
  let held = true;
  h.store.write = async put => held && put.reference.kind === "review/adversarial-pass" ? { status: "refused", refusal } : write(put);
  const refused = await record(h.store, input);
  expect(refused).toMatchObject({ exitCode: 1, envelope: { error: { code: envelope,
    message: expect.stringContaining(refusal.condition) } } });
  if (envelope === "store-refused") expect(refused.envelope).toMatchObject({ refusal, remedy: { argv: ["arc", "store", "pull"] } });
  expect(ReviewCommandErrorEnvelopeSchema.safeParse(refused.envelope).success).toBe(true);
  held = false;
  expect(await record(h.store, input)).toMatchObject({ exitCode: 0, envelope: { payload: { key: { number: 1 } } } });
});
