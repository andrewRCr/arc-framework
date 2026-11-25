import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema, HistoryRefSchema, type PullNotice } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), laterQuarter = ArchiveQuarterSchema.parse("2027-q1");

async function doubleFixture(layout: "default" | "separate", snapshot = false) {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("doubled"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "doubled" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const lineage = RecordReferenceSchema.parse({ owner: made.reference.owner, kind: "lineage/transition" });
  const content = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2,
    origin: { name: made.reference.owner.name, uid: "uid" in made.reference.owner ? made.reference.owner.uid : undefined },
    kind: "abandon", successors: [], incoming: [], ...snapshot ? { retiredBranches: [] } : {} }));
  const place = async (side: typeof h.a, placement: { kind: "active" } | { kind: "completed"; quarter: typeof quarter }) => {
    const record = success(await side.store.read({ reference: made.reference }));
    success(await side.store.write({ action: "put", reference: record.reference, expected: record.version, content: record.content,
      placement, provenance: placement.kind === "active" ? { verb: "reopen", lifecycleAction: "reopen" } : { verb: "archive", lifecycleAction: "archive" } }));
  };
  return { ...h, reference: made.reference, lineage, content, place };
}

describe("published double ends", () => {
  const layout = "default";
  it.each(["default", "separate"] as const)("keeps both published archives after a mirror erases the first, until reopening clears every quarter in %s", async layout => {
    const h = await doubleFixture(layout);
    await h.place(h.a, { kind: "completed", quarter }); success(await h.a.store.push());
    const registry = "refs/arc/project/registry";
    const firstRegistry = (await h.remote("git", ["rev-parse", registry])).stdout.trim();
    const erased = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
    for (const ref of erased.filter(ref => ref !== registry)) await h.remote("git", ["update-ref", "-d", ref]);
    await h.place(h.b, { kind: "completed", quarter: laterQuarter });
    const secondRegistry = (await h.b.git(["rev-parse", registry])).stdout.trim();
    expect(success(await h.b.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
    const publishedRegistry = (await h.remote("git", ["rev-parse", registry])).stdout.trim();
    for (const tip of [firstRegistry, secondRegistry]) await h.remote("git", ["merge-base", "--is-ancestor", tip, publishedRegistry]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const notices = success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices);
      expect(notices).toContainEqual(expect.objectContaining({ kind: "ended-twice", item: h.reference.owner }));
      expect(notices.some(({ kind }) => kind === "end-withdrawn" || kind === "end-pending")).toBe(false);
      expect((await h.a.git(["ls-tree", "-r", "--name-only", `refs/arc/archive/${quarter}`])).stdout).toContain(`metadata-${"uid" in h.reference.owner ? h.reference.owner.uid : ""}.json`);
      expect((await h.a.git(["ls-tree", "-r", "--name-only", `refs/arc/archive/${laterQuarter}`])).stdout).toContain(`metadata-${"uid" in h.reference.owner ? h.reference.owner.uid : ""}.json`);
    }
    success(await h.a.store.push());
    expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "ended-twice" }));
    const uid = "uid" in h.reference.owner ? h.reference.owner.uid : "", history = `refs/arc/history/work/${uid}` as const;
    await h.a.git(["fetch", "--refmap=", "--no-tags", "--no-filter", h.remoteName,
      `+${history}:refs/arc-remotes/${h.remoteName}/history/work/${uid}`]);
    success(await h.a.store.pull({ history: [history] }));
    await h.place(h.a, { kind: "active" });
    for (const heldQuarter of [quarter, laterQuarter]) {
      expect((await h.a.git(["ls-tree", "-r", "--name-only", `refs/arc/archive/${heldQuarter}`])).stdout).not.toContain(`metadata-${"uid" in h.reference.owner ? h.reference.owner.uid : ""}.json`);
    }
    await h.place(h.a, { kind: "completed", quarter: laterQuarter }); success(await h.a.store.push());
    for (const side of [h.a, h.b]) for (let attempt = 0; attempt < 2; attempt++) {
      expect(success(await side.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
      expect(success(await side.store.read({ reference: h.reference })).placement).toMatchObject({ kind: "completed", quarter: laterQuarter });
    }
  });

  it.each(["default", "separate"] as const)("recovers from full mirror erasure through the named registry divergence repair in %s", async layout => {
    const h = await doubleFixture(layout), registry = "refs/arc/project/registry";
    await h.place(h.a, { kind: "completed", quarter }); success(await h.a.store.push());
    const uid = "uid" in h.reference.owner ? h.reference.owner.uid : "";
    const metadata = `metadata-${uid}.json`;
    const firstFolder = async (remote: boolean) => {
      const args = ["ls-tree", "-r", "--name-only", `refs/arc/archive/${quarter}`];
      const refs = ["for-each-ref", "--format=%(refname)", `refs/arc/archive/${quarter}`];
      if (!(await (remote ? h.remote("git", refs) : h.a.git(refs))).stdout.trim()) return "";
      return (await (remote ? h.remote("git", args) : h.a.git(args))).stdout;
    };
    expect(await firstFolder(false)).toContain(metadata);
    expect(await firstFolder(true)).toContain(metadata);
    const retained = (await h.a.git(["rev-parse", registry])).stdout.trim();
    const erased = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
    for (const ref of erased) await h.remote("git", ["update-ref", "-d", ref]);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    expect(await firstFolder(true)).toBe("");
    await h.place(h.b, { kind: "completed", quarter: laterQuarter }); success(await h.b.store.push());
    const replacement = (await h.remote("git", ["rev-parse", registry])).stdout.trim();
    const observed = success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices);
    const diverged = observed.find((notice): notice is Extract<PullNotice, { kind: "history-diverged" }> =>
      notice.kind === "history-diverged" && notice.ref === registry);
    expect(diverged).toMatchObject({ kind: "history-diverged", ref: registry, remedy: { text: expect.stringContaining("Merge both") } });
    expect((await h.a.git(["rev-parse", registry])).stdout.trim()).toBe(retained);
    expect((await h.remote("git", ["rev-parse", registry])).stdout.trim()).toBe(replacement);
    expect(observed).toContainEqual(expect.objectContaining({ kind: "ended-twice", item: h.reference.owner }));
    expect(await firstFolder(false)).toContain(metadata);
    expect(await firstFolder(true)).not.toContain(metadata);
    if (!diverged) throw new Error("Expected registry rewrite repair");
    await mergeBoth(h, diverged);
    const repaired = success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices);
    expect(repaired).toContainEqual(expect.objectContaining({ kind: "ended-twice", item: h.reference.owner }));
    expect(await firstFolder(false)).toContain(metadata);
    expect(await firstFolder(true)).not.toContain(metadata);
    for (const notice of repaired) if (notice.kind === "history-diverged") await mergeBoth(h, notice);
    const history = HistoryRefSchema.parse(`refs/arc/history/work/${uid}`);
    const tracking = `refs/arc-remotes/${h.remoteName}/history/work/${uid}`;
    await h.a.git(["fetch", "--refmap=", "--no-tags", "--no-filter", h.remoteName, `+${history}:${tracking}`]);
    const settled = success(await h.a.store.pull({ history: [history] })).pulls.flatMap(({ notices }) => notices);
    expect(settled.some(({ kind }) => kind === "history-diverged")).toBe(false);
    // Replacing the retained history removes the first end's captured publication proof.
    const lifecycle = settled.filter(({ kind }) =>
      kind === "end-withdrawn" || kind === "ended-twice" || kind === "end-pending");
    expect(lifecycle).toEqual([expect.objectContaining({ kind: "end-withdrawn", item: h.reference.owner })]);
    expect(await firstFolder(false)).not.toContain(metadata);
    expect(await firstFolder(true)).not.toContain(metadata);
    expect(success(await h.a.store.read({ reference: h.reference })).placement).toMatchObject({ kind: "completed", quarter: laterQuarter });
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect(await firstFolder(false)).not.toContain(metadata);
    expect(await firstFolder(true)).not.toContain(metadata);
    expect((await h.remote("git", ["ls-tree", "-r", "--name-only", `refs/arc/archive/${laterQuarter}`])).stdout).toContain(metadata);
    for (const side of [h.a, h.b]) {
      expect(success(await side.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
      expect(success(await side.store.read({ reference: h.reference })).placement).toMatchObject({ kind: "completed", quarter: laterQuarter });
    }
  });

  it.each([["one clone", false], ["two clones", false], ["one clone", true], ["two clones", true]] as const)(
    "reports published lineage beside an archive from %s with branch snapshot %s until the named repair", async (mode, snapshot) => {
    const h = await doubleFixture(layout, snapshot);
    if (mode === "one clone") success(await h.a.store.write({ action: "put", reference: h.lineage, expected: null, content: h.content,
      provenance: { verb: "abandon", lifecycleAction: "prepare-abandon" } }));
    await h.place(h.a, { kind: "completed", quarter }); success(await h.a.store.push());
    if (mode === "two clones") {
      success(await h.b.store.write({ action: "put", reference: h.lineage, expected: null, content: h.content,
        provenance: { verb: "abandon", lifecycleAction: "prepare-abandon" } }));
      success(await h.b.store.push());
    }
    for (const side of [h.a, h.b]) for (let attempt = 0; attempt < 2; attempt++) {
      const result = success(await side.store.pull());
      expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "ended-twice", item: h.reference.owner,
        condition: expect.stringContaining("lineage"), remedy: { text: expect.stringMatching(/lineage.*reopen.*once/isu) } }));
      expect(result.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "end-pending")).toBe(false);
    }
    const lineage = success(await h.a.store.read({ reference: h.lineage }));
    success(await h.a.store.write({ action: "remove", reference: h.lineage, expected: lineage.version,
      provenance: { verb: "resolve", lifecycleAction: "resolve-end" } }));
    await h.place(h.a, { kind: "active" }); await h.place(h.a, { kind: "completed", quarter: laterQuarter });
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    for (const side of [h.a, h.b]) {
      expect(success(await side.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
      expect(success(await side.store.read({ reference: h.reference })).placement).toMatchObject({ kind: "completed", quarter: laterQuarter });
    }
  });
});

async function mergeBoth(h: Awaited<ReturnType<typeof doubleFixture>>, notice: Extract<PullNotice, { kind: "history-diverged" }>) {
  const lines = notice.remedy.text.slice(notice.remedy.text.indexOf("Merge both")).split("\n").slice(1);
  let executed = false;
  for (const line of lines) {
    if (!line.startsWith("'git'")) break;
    const argv = [...line.matchAll(/'((?:[^']|'"'"')*)'/gu)].map(match => (match[1] ?? "").replaceAll("'\"'\"'", "'"));
    await h.a.exec("git", argv.slice(1), { cwd: h.a.root }); executed = true;
  }
  expect(executed).toBe(true);
}
