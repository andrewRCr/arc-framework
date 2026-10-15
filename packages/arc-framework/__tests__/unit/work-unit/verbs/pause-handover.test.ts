/** Pause metadata and ownership change without moving lifecycle placement or checkout. */
import { expect, it } from "vitest";
import { runPause, runResumePaused, runHandover } from "../../../../src/lib/work-unit/verbs/pause-handover.js";
import { writeMetaPause } from "../../../../src/lib/store/kinds/meta/writers.js";
import { createStore } from "../../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../../src/lib/store/default-ports.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { LocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
const locusPorts: LocusPorts = { checkMarkerExclusivity: async () => ({ kind: "clear" }), findHoldingCheckout: async () => null,
  writeAnchoredMarker: async () => ({ kind: "unadmitted" }) };
function context(store: Store) { return { store, identity: "test-user", cwd: "/checkout", baseBranch: "main", locusPorts,
  now: () => new Date("2026-10-14T07:00:00Z"), exec: scriptGitExec([{ match: ["remote"], responses: [{ stdout: "" }, { stdout: "" }, { stdout: "" }] }]).exec }; }
it("writes first pause, amends only supplied fields, and keeps since", async () => {
  const { store, seedMeta } = createLifecycleHarness(); const record = await seedMeta("example"); const ctx = context(store);
  expect(await runPause(ctx, { name: "example", identity: "andrew", reason: "Review.", waitsOnNote: "Approval.", resumeNotes: "Continue.", open: true })).toMatchObject({ status: "paused" });
  expect(await runPause({ ...ctx, now: () => new Date("2026-10-15T07:00:00Z") }, { name: "example", identity: "andrew", reason: "Updated." })).toMatchObject({ status: "paused" });
  expect(lifecycleSuccess(await store.read({ reference: record.reference }))).toMatchObject({ placement: record.placement, fields: { state: "Active",
    pause: { pausedBy: "andrew", since: "2026-10-14T07:00:00.000Z", reason: "Updated.", waitsOn: { kind: "note", text: "Approval." }, resumeNotes: "Continue.", open: true } } });
  expect(await runPause(ctx, { name: "example", identity: "andrew", waitsOn: false, resumeNotes: false, open: false })).toMatchObject({ status: "paused" });
  expect(lifecycleSuccess(await store.read({ reference: record.reference })).fields).toMatchObject({ pause: { waitsOn: null, resumeNotes: null, open: false } });
});
it("refuses first pause without a reason and refuses a stub with start remedy", async () => {
  const { store, seedMeta } = createLifecycleHarness(); const record = await seedMeta("example");
  expect(await runPause(context(store), { name: "example", identity: "andrew" })).toMatchObject({ status: "rejected", reason: expect.stringContaining("--reason") });
  expect(lifecycleSuccess(await store.read({ reference: record.reference }))).toEqual(record);
  await seedMeta("stub", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
  expect(await runPause(context(store), { name: "stub", identity: "andrew", reason: "Wait." })).toMatchObject({ status: "rejected", reason: expect.stringContaining("arc start stub") });
});
it("resume clears only the section, repairs malformed structure, and refuses --here", async () => {
  const { store, seedMeta } = createLifecycleHarness(); const record = await seedMeta("example"); const ctx = context(store);
  expect(await runPause(ctx, { name: "example", identity: "andrew", reason: "Wait." })).toMatchObject({ status: "paused" });
  expect(await runResumePaused(ctx, { name: "example", here: true })).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "materialize", "example", "--here"] } });
  expect(await runResumePaused(ctx, { name: "example" })).toMatchObject({ status: "resumed" });
  expect(lifecycleSuccess(await store.read({ reference: record.reference })).content).toBe(record.content);
  const stored = [...store.state.records.values()][0]!;
  stored.content = writeMetaPause(record.content, { pausedBy: SlugSchema.parse("andrew"), since: "2026-10-14T07:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false });
  stored.content = stored.content.replace("---\n", stored.content.slice(stored.content.indexOf("## Pause"), stored.content.indexOf("---\n")) + "---\n");
  expect(await runResumePaused(ctx, { name: "example" })).toMatchObject({ status: "resumed" });
  expect(lifecycleSuccess(await store.read({ reference: record.reference })).content).toBe(record.content);
});
it("handover writes only Owner, including a paused work unit", async () => {
  const { store, seedMeta } = createLifecycleHarness(); const record = await seedMeta("example"); const ctx = context(store);
  await runPause(ctx, { name: "example", identity: "andrew", reason: "Wait." });
  const paused = lifecycleSuccess(await store.read({ reference: record.reference }));
  expect(await runHandover(ctx, { name: "example", to: "another-person" })).toMatchObject({ status: "handed-over", previousOwner: "test-user", owner: "another-person" });
  const next = lifecycleSuccess(await store.read({ reference: record.reference }));
  expect(next.fields).toMatchObject({ owner: "another-person", pause: expect.any(Object) });
  expect(next.placement).toEqual(paused.placement);
  expect(next.links).toEqual(paused.links);
  expect(next.content.slice(next.content.indexOf("- **Cohort:"))).toBe(paused.content.slice(paused.content.indexOf("- **Cohort:")));
});
it.each(["another-person", undefined])("handover refuses invoking identity %s before sharing observations", async (identity) => {
  const { store, seedMeta } = createLifecycleHarness(); const record = await seedMeta("example");
  let observations = 0;
  const ctx = { ...context(store), identity: identity!, exec: async () => { observations++; return { stdout: "" }; },
    locusPorts: { ...locusPorts, findHoldingCheckout: async () => { observations++; return null; } } };
  expect(await runHandover(ctx, { name: "example", to: "another-person" })).toMatchObject({ status: "rejected" });
  expect(lifecycleSuccess(await store.read({ reference: record.reference }))).toEqual(record);
  expect(observations).toBe(0);
  expect(await runHandover(context(store), { name: "example", to: "another-person" })).toMatchObject({ status: "handed-over" });
});
it("pre-flip pause and handover refuse unsupported with the existing path", async () => {
  const inRepo = createStore(createDefaultStorePorts({ checkoutRoot: "/checkout", exec: scriptGitExec([]).exec }));
  expect(await runPause(context(inRepo), { name: "example", identity: "andrew", reason: "Wait." })).toMatchObject({ status: "rejected", code: "unsupported", reason: expect.stringContaining("arc park") });
  expect(await runHandover(context(inRepo), { name: "example", to: "another-person" })).toMatchObject({ status: "rejected", code: "unsupported", reason: expect.stringContaining("Owner") });
});

it("rejects a reserved resume-notes heading with an actionable correction and accepts the repaired notes", async () => {
  const { store, seedMeta } = createLifecycleHarness(); const record = await seedMeta("example"); const ctx = context(store);
  expect(await runPause(ctx, { name: "example", identity: "andrew", reason: "Wait.", resumeNotes: "### Resume Notes\n\nContinue here." }))
    .toMatchObject({ status: "rejected", reason: expect.stringMatching(/reserved.*remove/iu) });
  expect(lifecycleSuccess(await store.read({ reference: record.reference }))).toEqual(record);
  expect(await runPause(ctx, { name: "example", identity: "andrew", reason: "Wait.", resumeNotes: "Continue here.\n\n### Details\n\nKeep this example." }))
    .toMatchObject({ status: "paused" });
  expect(lifecycleSuccess(await store.read({ reference: record.reference })).fields).toMatchObject({ pause: {
    resumeNotes: "Continue here.\n\n### Details\n\nKeep this example.",
  } });
});
