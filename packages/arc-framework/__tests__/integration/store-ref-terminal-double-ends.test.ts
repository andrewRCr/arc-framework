/** Published terminal-only siblings remain visible until one descendant repair end supersedes them. */
import { expect, it } from "vitest";
import { createRefStore, HistoryRefSchema, RecordReferenceSchema, type PullNotice } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

type Fixture = Awaited<ReturnType<typeof terminalFixture>>;
type Diverged = Extract<PullNotice, { kind: "history-diverged" }>;

async function terminalFixture(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const branches = [{ repository: "origin", ref: "refs/heads/work", linkedAs: "created" as const, excluded: [] }];
  await h.a.exec("git", ["branch", "work", "HEAD"]);
  const made = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "terminal" } }),
    content: makeMetaFixture("terminal", { owner: "andrew", branch: "work" }), placement: { kind: "active" }, links: { branches },
    provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const owner = made.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected terminal owner UID");
  const live = `refs/arc/work/${owner.uid}`, history = HistoryRefSchema.parse(`refs/arc/history/work/${owner.uid}`);
  const original = (await h.a.git(["rev-parse", live])).stdout.trim();
  const lineage = RecordReferenceSchema.parse({ owner, kind: "lineage/transition" });
  const content = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid },
    kind: "abandon", successors: [], incoming: [], retiredBranches: branches }));
  const retire = async (side: typeof h.a, createLineage = true) => {
    const current = success(await side.store.read({ reference: made.reference }));
    success(await side.store.batch({ writes: [
      ...createLineage ? [{ action: "put" as const, reference: lineage, expected: null, content }] : [],
      { action: "remove", reference: current.reference, expected: current.version },
    ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  };
  return { ...h, reference: made.reference, lineage, branches, live, history, original, retire };
}

function command(line: string): string[] {
  return [...line.matchAll(/'((?:[^']|'"'"')*)'/gu)].map(match => (match[1] ?? "").replaceAll("'\"'\"'", "'"));
}

async function mergeBoth(h: Fixture, notice: Diverged) {
  const lines = notice.remedy.text.slice(notice.remedy.text.indexOf("Merge both")).split("\n").slice(1);
  let ran = false;
  for (const line of lines) {
    if (!line.startsWith("'git'")) break;
    const argv = command(line);
    await h.a.exec("git", argv.slice(1), { cwd: h.a.root }); ran = true;
  }
  expect(ran).toBe(true);
}

it.each((["default", "separate"] as const).flatMap(layout => (["before capture", "after capture"] as const).map(timing => ({ layout, timing }))))(
  "distinguishes forced history replacement $timing and repairs terminal-only ends in $layout", async ({ layout, timing }) => {
  const h = await terminalFixture(layout), registry = "refs/arc/project/registry";
  await h.retire(h.a); await h.retire(h.b);
  const a = (await h.a.git(["rev-parse", h.history])).stdout.trim(), b = (await h.b.git(["rev-parse", h.history])).stdout.trim();
  success(await h.a.store.push());
  for (const ref of (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.split("\n").filter(Boolean)) {
    await h.remote("git", ["update-ref", "-d", ref]);
  }
  expect(success(await h.b.store.push()).publishes.filter(row => row.status === "failed")).toEqual([]);
  const observed = success(await h.a.store.pull({ history: [h.history] })).pulls.flatMap(({ notices }) => notices);
  const registryNotice = observed.find((notice): notice is Diverged => notice.kind === "history-diverged" && notice.ref === registry);
  if (!registryNotice) throw new Error("Expected a registry rewrite remedy");
  await mergeBoth(h, registryNotice);
  const repairedRegistry = success(await h.a.store.pull({ history: [h.history] })).pulls.flatMap(({ notices }) => notices);
  const historyNotice = repairedRegistry.find((notice): notice is Diverged => notice.kind === "history-diverged" && notice.ref === h.history)
    ?? observed.find((notice): notice is Diverged => notice.kind === "history-diverged" && notice.ref === h.history);
  if (!historyNotice) throw new Error("Expected a history rewrite remedy");
  let replaced = false;
  if (timing === "before capture") { await mergeBoth(h, historyNotice); replaced = true; }
  const store = createRefStore({ ...h.a.ports, exec: async (...args) => {
    const result = await h.a.ports.exec(...args);
    if (!replaced && args[1].includes("for-each-ref") && args[1].includes(`refs/arc-remotes/${h.remoteName}/`)) {
      await mergeBoth(h, historyNotice); replaced = true;
    }
    return result;
  } });
  const notices = success(await store.pull({ history: [h.history] })).pulls.flatMap(({ notices }) => notices);
  expect(replaced).toBe(true);
  if (timing === "before capture") {
    expect(notices).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(notices.some(({ kind }) => kind === "ended-twice")).toBe(false);
    return;
  }
  expect(notices).toContainEqual(expect.objectContaining({ kind: "ended-twice", item: h.reference.owner,
    remedy: { text: expect.stringContaining("CHOSEN_SAME_OWNER_TREE") } }));
  expect(notices.some(({ kind }) => kind === "end-withdrawn")).toBe(false);
  expect(success(await store.push()).publishes.filter(row => row.status === "failed")).toEqual([]);
  const doubled = success(await store.pull({ history: [h.history] })).pulls.flatMap(({ notices }) => notices)
    .find(notice => notice.kind === "ended-twice");
  if (!doubled) throw new Error("Expected the published terminal-only repair notice");
  const joined = (await h.a.git(["rev-parse", h.history])).stdout.trim();
  for (const parent of [a, b]) await h.a.git(["merge-base", "--is-ancestor", parent, joined]);
  const lineage = success(await store.read({ reference: h.lineage }));
  expect(JSON.parse(lineage.content).retiredBranches).toEqual(h.branches);
  const tree = (await h.a.git(["rev-parse", `${h.original}^{tree}`])).stdout.trim();
  const lines = doubled.remedy.text.split("\n");
  const commitLine = lines.find(line => line.startsWith("'git'") && line.includes("'commit-tree'"));
  const updateLine = lines.find(line => line.startsWith("'git'") && line.includes("'update-ref'"));
  if (!commitLine || !updateLine) throw new Error("Expected explicit native restoration commands");
  const restored = (await h.a.exec("git", command(commitLine).slice(1).map(arg => arg === "CHOSEN_SAME_OWNER_TREE" ? tree : arg), { cwd: h.a.root })).stdout.trim();
  const transaction = /```text\n([\s\S]*?)\n```/u.exec(doubled.remedy.text)?.[1];
  if (!transaction) throw new Error("Expected exact live/history transaction");
  await h.a.exec("git", command(updateLine).slice(1), { cwd: h.a.root, input: transaction.replaceAll("RESTORED_COMMIT", restored) + "\n" });
  const primary = success(await store.read({ reference: h.reference }));
  expect(primary.links?.branches).toEqual(h.branches);
  success(await store.write({ action: "remove", reference: primary.reference, expected: primary.version,
    provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  expect(success(await store.read({ reference: h.lineage })).content).toBe(lineage.content);
  const repaired = success(await store.push());
  expect(repaired.publishes.filter(row => row.status === "failed")).toEqual([]);
  expect(repaired.pulls.flatMap(({ notices }) => notices).filter(({ kind }) => kind === "ended-twice")).toEqual([]);
  for (const side of [h.a, h.b]) for (let attempt = 0; attempt < 2; attempt++) {
    const result = success(await side.store.pull({ history: [h.history] }));
    expect(result.pulls.flatMap(({ notices }) => notices).filter(({ kind }) => kind === "ended-twice" || kind === "end-withdrawn")).toEqual([]);
    const tip = (await side.git(["rev-parse", h.history])).stdout.trim();
    for (const parent of [a, b]) await side.git(["merge-base", "--is-ancestor", parent, tip]);
    expect((await side.git(["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
  }
}, 60_000);

it.each(["default", "separate"] as const)("does not report sequential terminal lifetimes as concurrent in %s", async layout => {
  const h = await terminalFixture(layout);
  await h.retire(h.a); success(await h.a.store.push());
  const parent = (await h.a.git(["rev-parse", h.history])).stdout.trim();
  const tree = (await h.a.git(["rev-parse", `${h.original}^{tree}`])).stdout.trim();
  const restored = (await h.a.git(["-c", "user.name=Repair", "-c", "user.email=repair@example.test", "commit-tree", tree,
    "-p", parent, "-m", "Restore authentic owner tree"])).stdout.trim();
  await h.a.ports.exec("git", [...h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [], "update-ref", "--stdin"], { cwd: h.a.root,
    input: `start\ncreate ${h.live} ${restored}\ndelete ${h.history} ${parent}\nprepare\ncommit\n` });
  await h.retire(h.a, false); success(await h.a.store.push());
  const result = success(await h.b.store.pull({ history: [h.history] }));
  expect(result.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "ended-twice")).toBe(false);
}, 60_000);
