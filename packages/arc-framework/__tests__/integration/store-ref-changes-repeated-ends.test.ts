import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { RecordReferenceSchema, sameReference, type RecordReference, type StateVersion } from "../../src/lib/store/index.js";

const provenance = { verb: "abandon", lifecycleAction: "abandon" };
type Fixture = Awaited<ReturnType<typeof refSyncFixture>>;
type Side = Fixture["a"];

/** Create one work item on the first clone and publish it to the second. */
async function published(h: Fixture, name: string): Promise<{ reference: RecordReference; live: string }> {
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture(name),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  if (!("uid" in made.reference.owner) || !made.reference.owner.uid) throw new Error("The item needs a UID");
  return { reference: made.reference, live: `refs/arc/work/${made.reference.owner.uid}` };
}

/** Write the item's lineage and remove its primary in one batch, which ends it. */
async function abandon(side: Side, reference: RecordReference): Promise<void> {
  if (!("uid" in reference.owner)) throw new Error("The item needs a UID");
  const current = success(await side.store.read({ reference }));
  success(await side.store.batch({ writes: [
    { action: "put", expected: null, reference: RecordReferenceSchema.parse({ kind: "lineage/transition", owner: reference.owner }),
      content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: reference.owner.name, uid: reference.owner.uid },
        kind: "abandon", successors: [], incoming: [] })) },
    { action: "remove", reference, expected: current.version },
  ], provenance }));
}

/** Write an item the side holds beside its lineage again, then remove it, which ends it a second time. */
async function reviveAndEnd(side: Side, reference: RecordReference, live: string, original: string): Promise<string> {
  // Pulling an old mirror tip can leave a record-free shell after merging the retirement's deletion. Restore actual
  // bytes as a descendant of that shell before editing, so the fixture does not rely on shell owner admission.
  const parent = (await side.git(["rev-parse", live])).stdout.trim();
  const tree = (await side.git(["rev-parse", `${original}^{tree}`])).stdout.trim();
  const restored = (await side.ports.execInput([...side.gitDir ? [`--git-dir=${side.gitDir}`] : [],
    "-c", "user.name=Mirror repair", "-c", "user.email=mirror@example.test", "commit-tree", tree, "-p", parent],
  "Restore mirrored item content\n", { cwd: side.root })).trim();
  await side.git(["update-ref", live, restored, parent]);
  const current = success(await side.store.read({ reference }));
  success(await side.store.write({ action: "put", expected: current.version, reference, content: makeMetaFixture(reference.owner.name),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  const revived = success(await side.store.read({ reference }));
  success(await side.store.write({ action: "remove", reference, expected: revived.version, provenance }));
  expect((await side.git(["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
  return revived.version;
}

/** Restore a published retirement through its live ref while retaining the lineage alone. */
async function restoredOnce(h: Fixture): Promise<{ reference: RecordReference; live: string; history: string; original: string;
  beforeEnds: StateVersion; betweenEnds: StateVersion; afterRestore: StateVersion }> {
  const { reference, live } = await published(h, "twice");
  const original = (await h.a.git(["rev-parse", live])).stdout.trim();
  const beforeEnds = success(await h.b.store.version());
  await abandon(h.a, reference);
  success(await h.a.store.push()); success(await h.b.store.pull());
  const betweenEnds = success(await h.b.store.version());
  // A mirror push of an earlier state brings the live ref back beside the lineage alone.
  await h.a.git(["push", h.remoteName, `${original}:${live}`]);
  success(await h.b.store.pull());
  const afterRestore = success(await h.b.store.version());
  return { reference, live, original, history: live.replace("refs/arc/", "refs/arc/history/"), beforeEnds, betweenEnds, afterRestore };
}

/** End the restored item again, leaving its two original ends in retained history. */
async function endedTwice(h: Fixture) {
  const restored = await restoredOnce(h);
  const registryBefore = (await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout.trim();
  const revived = await reviveAndEnd(h.b, restored.reference, restored.live, restored.original);
  return { ...restored, revived, registryBefore };
}

function versionsOf(entries: readonly { reference: RecordReference; version: string | null }[], reference: RecordReference): (string | null)[] {
  return entries.filter((entry) => sameReference(entry.reference, reference)).map(({ version }) => version);
}

describe("changes over an item that ended more than once", () => {
  it.each((["default", "separate"] as const).flatMap(layout => [false, true].map(restricted => ({ layout, restricted }))))(
    "discovers a whole restored lifetime between lineage-only endpoints in $layout (restricted=$restricted)", async ({ layout, restricted }) => {
    const h = await refSyncFixture(layout), twice = await endedTwice(h);
    const to = success(await h.b.store.version());
    const registry = "refs/arc/project/registry", tip = (await h.b.git(["rev-parse", registry])).stdout.trim();
    expect((await h.b.git(["rev-parse", `${tip}^{tree}`])).stdout)
      .toBe((await h.b.git(["rev-parse", `${twice.registryBefore}^{tree}`])).stdout);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", twice.live])).stdout).toBe("");
    const changes = success(await h.b.store.changes({ from: twice.betweenEnds, to,
      ...restricted ? { references: [twice.reference] } : {} }));
    expect(versionsOf(changes, twice.reference)).toEqual([twice.revived, null]);
    expect(changes.filter(entry => entry.reference.kind === "lineage/transition")).toEqual([]);
    expect(success(await h.b.store.changes({ from: to, to,
      ...restricted ? { references: [twice.reference] } : {} }))).toEqual([]);
  });

  it.each((["default", "separate"] as const).flatMap(layout => (["absent", "stale"] as const).map(history => ({ layout, history }))))(
    "compares the restored endpoint with $history current history in $layout", async ({ layout, history }) => {
    const h = await refSyncFixture(layout), restored = await restoredOnce(h);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", restored.history])).stdout).toBe("");
    if (history === "stale") await h.b.git(["update-ref", restored.history, restored.original]);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", restored.live])).stdout.trim()).toBe(restored.live);
    expect(versionsOf(success(await h.b.store.changes({ from: restored.betweenEnds, to: restored.afterRestore })), restored.reference)).toEqual([]);
  });

  it.each(["default", "separate"] as const)("never repeats the state version across a second end beside standing lineage in %s", async layout => {
    const h = await refSyncFixture(layout), twice = await endedTwice(h);
    const to = success(await h.b.store.version());
    expect(to).not.toBe(twice.betweenEnds);
    const registry = "refs/arc/project/registry";
    const tip = (await h.b.git(["rev-parse", registry])).stdout.trim();
    expect(tip).not.toBe(twice.registryBefore);
    expect((await h.b.git(["rev-parse", `${tip}^`])).stdout.trim()).toBe(twice.registryBefore);
    expect((await h.b.git(["rev-parse", `${tip}^{tree}`])).stdout)
      .toBe((await h.b.git(["rev-parse", `${twice.registryBefore}^{tree}`])).stdout);
    expect(versionsOf(success(await h.b.store.changes({ from: twice.afterRestore, to })), twice.reference)).toEqual([twice.revived, null]);
  });

  it.each(["default", "separate"] as const)("excludes the retired owner's old writes when lineage alone precedes its restoration in %s", async layout => {
    const h = await refSyncFixture(layout);
    const twice = await endedTwice(h);
    expect(versionsOf(success(await h.b.store.changes({ from: twice.betweenEnds, to: twice.afterRestore })), twice.reference)).toEqual([]);
  });

  it("lists the writes and removal since a live ref came back beside lineage, when the item then ended again", async () => {
    const h = await refSyncFixture();
    const twice = await endedTwice(h);
    const changes = success(await h.b.store.changes({ from: twice.afterRestore, to: success(await h.b.store.version()) }));
    expect(versionsOf(changes, twice.reference)).toEqual([twice.revived, null]);
  });

  it("lists through the latest end when a window from before both ends compares against the current state", async () => {
    const h = await refSyncFixture();
    const twice = await endedTwice(h);
    const changes = success(await h.b.store.changes({ from: twice.beforeEnds, to: success(await h.b.store.version()) }));
    expect(versionsOf(changes, twice.reference)).toEqual([null, twice.revived, null]);
  });

  it("refuses a window past both ends against an earlier state, and reads it against the current state", async () => {
    const h = await refSyncFixture();
    const twice = await endedTwice(h);
    expect(await h.b.store.changes({ from: twice.beforeEnds, to: twice.betweenEnds })).toMatchObject({ status: "refused",
      refusal: { code: "state-unresolvable", stateVersion: twice.betweenEnds, historyRefs: [],
        remedy: { text: expect.stringContaining("current state version") } } });
    expect(versionsOf(success(await h.b.store.changes({ from: twice.beforeEnds, to: success(await h.b.store.version()) })), twice.reference))
      .toEqual([null, twice.revived, null]);
  });

  it("refuses a window past the restore while retained history lacks the later end, and reads it once restored", async () => {
    const h = await refSyncFixture();
    const twice = await endedTwice(h);
    const tip = (await h.b.git(["rev-parse", twice.history])).stdout.trim();
    // The retained copy holds the first end and the revival, but not the second end.
    await h.b.git(["update-ref", twice.history, `${tip}^`]);
    const to = success(await h.b.store.version());
    expect(await h.b.store.changes({ from: twice.afterRestore, to })).toMatchObject({ status: "refused",
      refusal: { code: "state-unresolvable", historyRefs: [twice.history] } });
    await h.b.git(["update-ref", twice.history, tip]);
    expect(versionsOf(success(await h.b.store.changes({ from: twice.afterRestore, to })), twice.reference)).toEqual([twice.revived, null]);
  });

  it("reads through the end a clone holds when it missed a revival elsewhere, and through the latest once it pulls the history", async () => {
    const h = await refSyncFixture();
    const { reference, live } = await published(h, "missed");
    const original = (await h.a.git(["rev-parse", live])).stdout.trim();
    const beforeEnds = success(await h.a.store.version());
    await abandon(h.a, reference);
    success(await h.a.store.push()); success(await h.b.store.pull());
    // The item comes back, is written, and ends again on the second clone while the first does not pull.
    await h.a.git(["push", h.remoteName, `${original}:${live}`]);
    success(await h.b.store.pull());
    const revived = await reviveAndEnd(h.b, reference, live, original);
    success(await h.b.store.push()); success(await h.a.store.pull());
    const read = async (): Promise<(string | null)[]> =>
      versionsOf(success(await h.a.store.changes({ from: beforeEnds, to: success(await h.a.store.version()) })), reference);
    expect(await read()).toEqual([null]);
    success(await h.a.store.pull({ history: [`refs/arc/history/work/${"uid" in reference.owner ? reference.owner.uid : ""}`] }));
    expect(await read()).toEqual([null, revived, null]);
  });

  it("bounds a window at the published end, never at the retirement of an end this clone withdrew", async () => {
    const h = await refSyncFixture();
    const { reference } = await published(h, "withdrawn");
    const beforeEnds = success(await h.a.store.version());
    await abandon(h.a, reference); await abandon(h.b, reference);
    success(await h.b.store.push());
    const result = success(await h.a.store.push());
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    const settled = success(await h.a.store.version());
    // A later write elsewhere leaves the settled state behind, so only its held ends can bound the window.
    success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("later"), placement: { kind: "active" },
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "later" } }), provenance }));
    expect(versionsOf(success(await h.a.store.changes({ from: beforeEnds, to: settled })), reference)).toEqual([null]);
  });
});
