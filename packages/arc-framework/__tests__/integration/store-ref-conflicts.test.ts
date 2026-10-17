import { describe, expect, it } from "vitest";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { mutationOf, seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";
import { makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { ConflictRecordSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { parseStoreCommitProvenance } from "../../src/lib/store/commit-provenance.js";

const personalRef = "refs/arc/user/test-user/personal";
const now = "2026-07-01T12:34:56.000Z";

async function legacyChange(f: RefConformanceFixture, key: string, email: string) {
  const git = makeGitExec(f.root);
  const parent = (await git("git", ["rev-parse", personalRef])).stdout;
  const metadata = (await git("git", ["show", `${personalRef}:test-user/metadata-test-user.json`])).stdout;
  const planted = await plantRef(f.root, personalRef, [
    { path: "test-user/metadata-test-user.json", content: metadata }, { path: `test-user/${key}`, content: "legacy\n" },
  ], { parents: [parent] });
  const epoch = Date.parse("2025-03-01T10:00:00Z") / 1000;
  const raw = `tree ${planted.tree}\nparent ${parent}\nauthor Human <human@example.test> ${epoch} +0000\n` +
    `committer Human <${email}> ${epoch} +0000\n\nManual change\n`;
  const oid = (await makeGitExecInput(f.root)(["hash-object", "-w", "-t", "commit", "--stdin"], raw)).trim();
  await git("git", ["update-ref", personalRef, oid, planted.tip]);
}

describe("preserved stale-write conflicts", () => {
  it("files a separate merge commit with exact side labels and a fresh conflict on every retry", async () => {
    const f = await createRefFixture();
    const base = await seed(f, f.reference("personal/document"), "base\n");
    const stored = createRefStore({ ...f.ports, actor: async () => "test-user@machine-one" });
    success(await stored.write(update(f, base, "current\n")));
    const git = makeGitExec(f.root);
    const changedAt = new Date((await git("git", ["show", "-s", "--format=%cI", personalRef])).stdout).toISOString();
    await seed(f, f.reference("personal/document", "unrelated"), "Unrelated write.\n");
    const before = (await git("git", ["rev-parse", personalRef])).stdout;
    const incoming = createRefStore({ ...f.ports, actor: async () => "test-user@machine-two", clock: () => new Date(now) });
    const provenance = { ...testProvenance, verb: "save", lifecycleAction: "edit" };
    const input = { writes: [mutationOf(update(f, base, "incoming\n"))], provenance };
    const batch = success(await incoming.batch(input));
    expect((await git("git", ["rev-list", "--count", `${before}..${personalRef}`])).stdout).toBe("2");
    const result = batch.writes[0]!;
    expect(result.conflicts).toHaveLength(1);
    const conflict = result.conflicts[0]!;
    expect(conflict.owner).toEqual(base.reference.owner);
    expect(conflict.key).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u);
    expect((await git("git", ["ls-tree", "-r", "--name-only", personalRef])).stdout)
      .toContain(`test-user/conflicts/${conflict.key}.json`);
    const filed = success(await incoming.read({ reference: conflict }));
    const content = ConflictRecordSchema.parse(JSON.parse(filed.content));
    expect(content).toMatchObject({ record: base.reference, location: { kind: "hunk", start: 0, end: 1 }, baseVersion: base.version,
      currentLines: 1, incomingLines: 1, current: { content: "current", label: { actor: "test-user@machine-one", time: changedAt } },
      incoming: { content: "incoming", label: { actor: "test-user@machine-two", time: now } } });
    const ownMessage = (await git("git", ["show", "-s", "--format=%B", `${personalRef}^`])).stdout;
    expect(parseStoreCommitProvenance(ownMessage, base.reference)).toEqual({ ...provenance, reference: base.reference, batchId: batch.batchId });
    const history = success(await incoming.history({ reference: conflict }));
    expect(history[0]?.provenance).toEqual({ ...provenance, verb: "merge", reference: conflict, batchId: batch.batchId });
    const retry = success(await incoming.batch(input)).writes[0]!;
    expect(retry.conflicts).toHaveLength(1);
    expect(retry.conflicts[0]).not.toEqual(conflict);
    expect(success(await incoming.read({ reference: base.reference }))).toMatchObject({ content: "current\n",
      conflicts: expect.arrayContaining([conflict, retry.conflicts[0]]) });
    expect(success(await incoming.history({ reference: base.reference }))).toHaveLength(2);
  });

  it.each(["human@example.test", ""])("labels a legacy stored side using committer email %j", async (email) => {
    const f = await createRefFixture();
    const base = await seed(f, f.reference("personal/document"), "base\n");
    await legacyChange(f, String(base.reference.key), email);
    const result = success(await f.store.write(update(f, base, "incoming\n")));
    const conflict = success(await f.store.read({ reference: result.conflicts[0]! }));
    expect(JSON.parse(conflict.content)).toMatchObject({ current: { label: {
      actor: email || "unknown", time: "2025-03-01T10:00:00.000Z",
    } } });
  });

  it("labels an incoming clone without identity using its Git committer email", async () => {
    const f = await createRefFixture();
    const base = await seed(f, f.reference("work-item/companion"), "base\n");
    success(await f.store.write(update(f, base, "current\n")));
    await makeGitExec(f.root)("git", ["config", "user.email", "unconfigured-person@example.test"]);
    f.identity(undefined);
    const incoming = createRefStore({ ...f.ports, clock: () => new Date(now) });
    const result = success(await incoming.write(update(f, base, "incoming\n")));
    const conflict = success(await incoming.read({ reference: result.conflicts[0]! }));
    expect(JSON.parse(conflict.content)).toMatchObject({ incoming: { label: { actor: "unconfigured-person@example.test", time: now } } });
  });

  it("decodes a lineage conflict's owner from its target without an origin map entry", async () => {
    const f = await createRefFixture();
    const subject = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: {
      type: "work-item", name: "retired-origin", uid: "00000000-0000-4000-8000-000000000001",
    } });
    const reference = RecordReferenceSchema.parse({ kind: "lineage/conflict-record", owner: subject.owner, key: "manual-clash" });
    const label = { actor: "test-user@machine", time: now };
    const content = ConflictRecordSchema.parse({ record: subject, location: { kind: "hunk", start: 0, end: 1 },
      baseVersion: null, currentLines: 1, incomingLines: 1, base: "base", current: { content: "current", label }, incoming: { content: "incoming", label } });
    success(await f.store.write({ action: "put", reference, expected: null, content: JSON.stringify(content), provenance: testProvenance }));
    expect(success(await f.store.read({ reference })).reference).toEqual(reference);
    const listed = success(await f.store.list({ family: "lineage" }));
    expect(listed).toMatchObject({ status: "complete", missed: false, records: [{ reference }] });
  });
});
