/** Restore retains consumed evidence and exact accepted values before any ref reset. */
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { recordRestoreFixture, restoreFixture } from "../helpers/cutover-window/restore.js";
import { readWindowHold } from "../../src/scripts/cutover-window/hold.js";
import { seedTransients, transientCommon, transientSourceRef } from "../helpers/store/import-transients.js";
import { saveImportPersonal } from "../helpers/store/import-fixture.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { updateRefTransaction, type RefChange } from "../../src/lib/git/ref-transaction.js";
import { listWindowRefs } from "../../src/scripts/cutover-window/git.js";
import { hashBlob, writeTreeCommit } from "../../src/lib/git/ref-tree.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";

async function decisionSource(advance = false) {
  const h = await windowFixture();
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const claim = { ...transientCommon, kind: "groom" as const, slug: "groom-alpha", anchorStub: "alpha", members: ["alpha"],
    openedBaseHead: head, protection: "partial" as const, branch: null, state: "open" as const, changeRequest: null };
  const held = await seedTransients(h, [claim]);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  let current = held;
  if (advance) {
    const changed = serializeTransientIdentityRecord(TransientIdentityRecordSchema.parse({ ...claim, members: ["alpha", "beta"] }));
    const blob = await hashBlob(h.ports.execInput, changed);
    current = await writeTreeCommit({ exec: h.git, execInput: h.ports.execInput }, transientSourceRef,
      new Map([[claim.slug, blob]]), "Advance the identity input", [held], held);
    await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  }
  return { h, held, current, claim };
}
async function importSource(h: Awaited<ReturnType<typeof windowFixture>>,
  pause?: "import.land" | "import.publish" | "import.transient.remote-delete"): Promise<void> {
  await saveImportPersonal(h.root, false);
  expect(await invokeStoreRemote(["origin", "push"], { cwd: h.root })).toMatchObject({ result: { status: "ok" } });
  if (pause) {
    h.ports.migrateStep = step => step === pause ? Promise.reject(new Error("pause-import")) : Promise.resolve();
    await expect(h.migrate()).rejects.toThrow("pause-import");
  } else expect(await h.migrate()).toMatchObject({ status: "ok" });
}
const allRefs = async (h: Awaited<ReturnType<typeof windowFixture>>) =>
  (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;

it("requires explicit acceptance of changed consumed records after publication dropped the kept tips", async () => {
  const { h, held } = await decisionSource(true);
  await importSource(h);
  const before = await allRefs(h);
  const refused = await recordRestoreFixture(h);
  expect(refused).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({ subject: transientSourceRef })] } });
  for (const text of [transientSourceRef, held, "claims/groom", "beta"]) expect(refused.report).toContain(text);
  expect(await allRefs(h)).toBe(before);
  expect(await recordRestoreFixture(h, [`${transientSourceRef}=absent`])).toMatchObject({ exit: 0, result: { status: "reported", data: {
    version: 1, regime: "records", identities: [{ ref: transientSourceRef, held, kept: null, outcome: "accepted" }],
    accepted: [{ ref: transientSourceRef, value: null }],
  } } });
  expect((await h.git("git", ["rev-parse", "refs/arc-window/restore"])).stdout.trim()).toMatch(/^[a-f0-9]{40,64}$/u);
}, 60_000);

it("requires the actual consumed tip while the import still retains its source and origin copy", async () => {
  const { h, held, current } = await decisionSource(true);
  await importSource(h, "import.transient.remote-delete");
  const before = await allRefs(h);
  for (const accepted of [[], [`${transientSourceRef}=absent`]]) {
    const refused = await recordRestoreFixture(h, accepted);
    expect(refused).toMatchObject({ exit: 1, result: { status: "refused" } });
    for (const text of [held, current, "claims/groom", "beta"]) expect(refused.report).toContain(text);
    expect(await allRefs(h)).toBe(before);
  }
  expect(await recordRestoreFixture(h, [`${transientSourceRef}=${current}`])).toMatchObject({ exit: 0, result: { status: "reported", data: {
    regime: "kept", identities: [{ ref: transientSourceRef, held, kept: current, outcome: "accepted" }],
    accepted: [{ ref: transientSourceRef, value: current }],
  } } });
  const io = { repo: h.root, exec: h.git, execInput: h.ports.execInput }, { record } = await readWindowHold(io);
  const restored = await restoreFixture(h, [`${transientSourceRef}=${current}`]);
  expect(restored, restored.report).toMatchObject({ exit: 0 });
  expect(Object.fromEntries(await listWindowRefs(io, ["refs/arc/"]))).toEqual(record.refs.local);
  expect(Object.fromEntries(await listWindowRefs({ repo: h.origin, exec: h.remote }, ["refs/arc/"]))).toEqual(record.refs.origin);
  expect(await listWindowRefs(io, ["refs/arc-window/"])).toEqual(new Map());
}, 60_000);

it.each(["same", "advanced", "deleted"] as const)("records unconsumed input before landing with the canonical ref %s", async mode => {
  const { h, held, current } = await decisionSource(mode === "advanced");
  await importSource(h, "import.land");
  if (mode === "deleted") await h.git("git", ["update-ref", "-d", transientSourceRef, held]);
  const before = await allRefs(h);
  if (mode !== "same") {
    expect(await recordRestoreFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
      subject: transientSourceRef, condition: expect.stringContaining(mode === "deleted" ? "absent" : current),
    })] } });
    expect(await allRefs(h)).toBe(before);
  }
  const accepted = mode === "same" ? [] : [`${transientSourceRef}=${mode === "deleted" ? "absent" : current}`];
  expect(await recordRestoreFixture(h, accepted)).toMatchObject({ exit: 0, result: { status: "reported", data: {
    regime: "unconsumed", identities: [{ ref: transientSourceRef, held, kept: null, outcome: mode === "same" ? "unconsumed" : "accepted" }],
    accepted: mode === "same" ? [] : [{ ref: transientSourceRef, value: mode === "deleted" ? null : current }],
  } } });
}, 60_000);

it("records a held claim before any import or retained tips exist", async () => {
  const { h, held } = await decisionSource();
  expect(await recordRestoreFixture(h)).toMatchObject({ exit: 0, result: { status: "reported", data: {
    regime: "unconsumed", identities: [{ ref: transientSourceRef, held, kept: null, outcome: "unconsumed" }], accepted: [],
  } } });
}, 30_000);

it("refuses an acceptance value that was not observed for that ref and permits retry with the actual input", async () => {
  const { h } = await decisionSource();
  const before = await allRefs(h);
  expect(await recordRestoreFixture(h, [`${transientSourceRef}=${h.flip.head}`])).toMatchObject({ exit: 1, result: {
    status: "refused", findings: [expect.objectContaining({ subject: transientSourceRef, remedy: expect.stringContaining("actually found") })],
  } });
  expect(await allRefs(h)).toBe(before);
  expect(await recordRestoreFixture(h)).toMatchObject({ exit: 0, result: { status: "reported" } });
}, 30_000);

it("reads the recorded consumption decision after the restore's ref targets removed import evidence", async () => {
  const { h, held } = await decisionSource(true);
  await importSource(h);
  const first = await recordRestoreFixture(h, [`${transientSourceRef}=absent`]);
  expect(first).toMatchObject({ exit: 0, result: { status: "reported", data: { regime: "records" } } });
  const decisionTip = (await h.git("git", ["rev-parse", "refs/arc-window/restore"])).stdout.trim();
  await h.git("git", ["push", `--force-with-lease=${transientSourceRef}:`, "origin",
    `refs/arc-window/origin/${transientSourceRef}:${transientSourceRef}`]);
  const origin = await listWindowRefs({ repo: h.origin, exec: h.remote }, ["refs/arc/"]);
  for (const [ref, tip] of [...origin].sort(([left], [right]) => Number(left === "refs/arc/project/registry") - Number(right === "refs/arc/project/registry"))) {
    if (ref !== transientSourceRef) await h.remote("git", ["update-ref", "-d", ref, tip]);
  }
  const local = await listWindowRefs({ repo: h.root, exec: h.git }, ["refs/arc/", "refs/arc-remotes/origin/"]);
  const changes: RefChange[] = [...local].filter(([ref]) => ref !== transientSourceRef)
    .map(([ref, expected]) => ({ ref, expected, delete: true }));
  changes.push({ ref: transientSourceRef, next: held, expected: local.get(transientSourceRef) ?? null });
  expect(await updateRefTransaction(h.ports, changes, { cwd: h.root })).toEqual({ status: "committed" });
  const before = await allRefs(h);
  const resumed = await recordRestoreFixture(h);
  expect(resumed.exit).toBe(0);
  expect(resumed.result).toEqual(first.result);
  expect((await h.git("git", ["rev-parse", "refs/arc-window/restore"])).stdout.trim()).toBe(decisionTip);
  expect(await allRefs(h)).toBe(before);
}, 60_000);

it.each(["missing", "invalid-json"] as const)("preserves an unreadable %s saved decision and resumes after its repair", async fault => {
  const { h } = await decisionSource();
  const first = await recordRestoreFixture(h);
  expect(first.exit).toBe(0);
  const good = (await h.git("git", ["rev-parse", "refs/arc-window/restore"])).stdout.trim();
  const entries = new Map<string, string>();
  if (fault === "invalid-json") entries.set("restore.json", await hashBlob(h.ports.execInput, "{invalid"));
  const bad = await writeTreeCommit({ exec: h.git, execInput: h.ports.execInput }, "refs/arc-window/restore", entries,
    "Inject unreadable saved evidence", [good], good);
  const before = await allRefs(h);
  expect(await recordRestoreFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    subject: "restore decision", condition: expect.stringContaining("cannot be read"), remedy: expect.stringContaining("Preserve"),
  })] } });
  expect(await allRefs(h)).toBe(before);
  await h.git("git", ["update-ref", "refs/arc-window/restore", good, bad]);
  const repaired = await recordRestoreFixture(h);
  expect(repaired.exit).toBe(0);
  expect(repaired.result).toEqual(first.result);
}, 30_000);

it("appends a newly observed acceptance after recording without recomputing its original consumption facts", async () => {
  const { h, held, claim } = await decisionSource();
  expect(await recordRestoreFixture(h)).toMatchObject({ exit: 0 });
  const first = (await h.git("git", ["rev-parse", "refs/arc-window/restore"])).stdout.trim();
  const content = serializeTransientIdentityRecord(TransientIdentityRecordSchema.parse({ ...claim, members: ["alpha", "beta"] }));
  const blob = await hashBlob(h.ports.execInput, content);
  const current = await writeTreeCommit({ exec: h.git, execInput: h.ports.execInput }, transientSourceRef,
    new Map([[claim.slug, blob]]), "Move a ref after restore recording", [held], held);
  const before = await allRefs(h);
  expect(await recordRestoreFixture(h, [`${transientSourceRef}=${h.flip.head}`])).toMatchObject({ exit: 1, result: { status: "refused" } });
  expect(await allRefs(h)).toBe(before);
  const updated = await recordRestoreFixture(h, [`${transientSourceRef}=${current}`]);
  expect(updated).toMatchObject({ exit: 0, result: { status: "reported", data: {
    regime: "unconsumed", identities: [{ ref: transientSourceRef, held, kept: null, outcome: "unconsumed" }], differences: [],
    accepted: [{ ref: transientSourceRef, value: current }],
  } } });
  const next = (await h.git("git", ["rev-parse", "refs/arc-window/restore"])).stdout.trim();
  expect(next).not.toBe(first);
  expect((await h.git("git", ["rev-parse", `${next}^`])).stdout.trim()).toBe(first);
  expect(await recordRestoreFixture(h, [`${transientSourceRef}=${current}`])).toEqual(updated);
  expect((await h.git("git", ["rev-parse", "refs/arc-window/restore"])).stdout.trim()).toBe(next);
}, 30_000);
