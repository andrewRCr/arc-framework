/** Agenda comparisons across stored handoff history and identity boundaries. */
import { expect, it } from "vitest";
import { compileResumeContext, compileStateFreshness } from "../../src/commands/agenda/context.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { writeMetaOwner, writeMetaSessionContext } from "../../src/lib/store/kinds/meta/writers.js";
import { createAgendaFixtureInput } from "../helpers/agenda-fixtures.js";
import { makeGitExec } from "../helpers/integration.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { activeSessionInit, derivedFrameFromActive, sessionInitFixture } from "../helpers/session-init-fixtures.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

it("reports the missing archived history and its remedy when comparing a reachable handoff baseline", async () => {
  const f = await createRefFixture();
  const item = await seed(f, f.reference("work-item/meta"));
  const baseline = await f.settle();
  success(await f.store.write({ ...update(f, item, item.content),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
  const current = await f.settle();
  expect(success(await f.store.changes({ from: baseline, to: current }))).toHaveLength(1);

  const git = makeGitExec(f.root);
  const history = (await git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/history/work/"])).stdout.trim();
  const tip = (await git("git", ["rev-parse", history])).stdout.trim();
  await git("git", ["update-ref", "-d", history]);
  const comparison = await f.store.changes({ from: baseline, to: current });
  expect(comparison).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", stateVersion: current, historyRefs: [history],
  } });
  if (comparison.status !== "refused") throw new Error("Expected missing archived history");

  const note = await compileStateFreshness(f.store, baseline, item.reference, "andrew");
  expect(note?.text).toContain(comparison.refusal.condition);
  expect(note?.text).toContain(comparison.refusal.remedy.text);
  expect(note?.text).not.toContain(`baseline '${baseline}' is unreachable`);

  await git("git", ["update-ref", history, tip]);
  expect((await compileStateFreshness(f.store, baseline, item.reference, "andrew"))?.text).toContain("work-item/meta");
});

it.each([false, true])("reports shared handover and includes scratch edits with a personal baseline=%s", async bounded => {
  const { a, b } = await refSyncFixture();
  const sender = createRefStore({ ...a.ports, identity: async () => SlugSchema.parse("alice"),
    actor: async () => "alice@00000000-0000-4000-8000-000000000001" });
  const recipient = bounded ? a : b; // Both fixture clones are configured for andrew.
  const scratch = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" },
    key: "scratch/before-handoff.md" });
  success(await recipient.store.write({ action: "put", reference: scratch, expected: null, content: "Earlier work",
    provenance: { verb: "save", lifecycleAction: "edit" } }));

  const primary = { action: "put" as const, placement: { kind: "active" as const },
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "work" } }) };
  const created = success(await sender.write({ ...primary, expected: null, content: makeMetaFixture("work", { owner: "alice" }),
    provenance: { verb: "start", lifecycleAction: "start" } }));
  if (created.version === undefined) throw new Error("Expected a saved meta version");
  const stateAtHandoff = success(await sender.version());
  const content = writeMetaSessionContext(makeMetaFixture("work", { owner: "alice", stateAtHandoff }), "Resume work.");
  const anchored = success(await sender.write({ ...primary, reference: created.reference, expected: created.version,
    content, provenance: { verb: "handoff-write", lifecycleAction: "handoff" } }));
  if (anchored.version === undefined) throw new Error("Expected a saved handoff version");
  success(await sender.write({ ...primary, reference: created.reference, expected: anchored.version,
    content: writeMetaOwner(content, SlugSchema.parse("andrew")), provenance: { verb: "handover", lifecycleAction: "handover" } }));
  if (!bounded) {
    success(await sender.push());
    success(await recipient.store.pull());
  }
  const after = RecordReferenceSchema.parse({ ...scratch, key: "scratch/after-handoff.md" });
  success(await recipient.store.write({ action: "put", reference: after, expected: null, content: "Follow-up notes",
    provenance: { verb: "save", lifecycleAction: "edit" } }));
  const current = success(await recipient.store.version());
  const changes = success(await recipient.store.changes({ from: stateAtHandoff, to: current }));
  const personal = changes.filter(change => change.reference.kind === "personal/document").map(change => change.reference.key);
  expect(personal).toEqual(bounded ? [after.key] : [scratch.key, after.key]);

  const meta = success(await recipient.store.read({ reference: created.reference }));
  const owner = meta.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected a UID for the handed-over unit");
  const metaPath = ".arc/active/meta-work.md";
  const active = activeSessionInit({ resolution: "single", path: metaPath, sessionType: "execution" });
  const envelope = await sessionInitFixture({ derivedLocusState: async identity =>
    derivedFrameFromActive(active, identity, null, null, null, true, owner.uid) });
  const input = createAgendaFixtureInput(envelope);
  const { steps } = await compileResumeContext({ ...input, entry: { ...input.entry, cwd: recipient.root, store: recipient.store },
    read: { ...input.read, exists: async path => path === metaPath, size: async () => meta.content.length, read: async () => meta.content } });
  const [note] = steps.flatMap(step => step.type === "note" && step.surface === "freshness-gap" ? [step.text] : []);
  expect(note).toContain("work-item/meta work by handover");
  expect(note).not.toContain("scratch/before-handoff.md");
  if (bounded) expect(note).toContain("scratch/after-handoff.md");
  else expect(note).not.toContain("scratch/after-handoff.md");
});
