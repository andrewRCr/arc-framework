import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema } from "../../src/lib/store/refusal.js";

it.each(["default", "separate"] as const)("keeps the merged %s baseline until its applied local history is restored", async layout => {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("history-control"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "history-control" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
  const owner = made.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a stored owner");
  const live = `refs/arc/work/${owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
  const key = `refs/arc/tmp/seen/${h.remoteName}`, seen = `${key}/work/${owner.uid}`;
  const tip = async (ref: string) => (await h.b.git(["for-each-ref", "--format=%(objectname)", ref])).stdout.trim();
  success(await h.a.store.push()); success(await h.b.store.pull());
  const original = await tip(live), current = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: made.reference, expected: current.version, content: current.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.a.store.push());
  let removed = "";
  const observer = createRefStore({ ...h.b.ports, lock: async (name, wait) => {
    if (name === key && !removed && await tip(history) && !await tip(live)) {
      removed = await tip(history);
      await h.b.git(["update-ref", "-d", history, removed]);
    }
    return h.b.ports.lock(name, wait);
  } });
  success(await observer.pull());
  expect(removed).toMatch(/^[0-9a-f]{40}$/u);
  expect(await tip(history)).toBe("");
  expect(await tip(seen)).toBe(original);
  await h.b.git(["update-ref", history, removed]);
  success(await h.b.store.pull());
  expect(await tip(seen)).toBe("");
  expect(await tip(history)).toBe(removed);
}, 60_000);

describe.each(["default", "separate"] as const)("ended keeper observation in %s", layout => {
  it.each(["push", "read"] as const)("retains a newer leased fetch's keeper after old %s end proof", async role => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("ended-keeper"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ended-keeper" } }),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    const owner = made.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a stored owner");
    const ref = `refs/arc/work/${owner.uid}`, tracking = `refs/arc-remotes/${h.remoteName}/work/${owner.uid}`;
    const seen = `refs/arc/tmp/seen/${h.remoteName}/work/${owner.uid}`, key = `refs/arc/tmp/seen/${h.remoteName}`;
    success(await h.a.store.push()); success(await h.b.store.pull());
    const original = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
    const rows = (await h.remote("git", ["ls-tree", "-r", "--format=%(objectname) %(path)", ref])).stdout.trim().split("\n");
    const entries = rows.map(row => ({ oid: row.slice(0, 40), path: row.slice(41), mode: "100644" as const }));
    const current = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: made.reference, expected: current.version, content: current.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.a.store.push());
    await h.b.git(["config", `remote.${h.remoteName}.arc-state`, role]);
    let armed = true, newer = "";
    const observer = createRefStore({ ...h.b.ports, lock: async (name, wait) => {
      const release = await h.b.ports.lock(name, wait);
      return async () => {
        await release();
        if (name !== key || !armed) return;
        armed = false;
        const siblingRelease = await h.b.ports.lock(key);
        try {
          newer = (await plantRef(h.origin, ref, entries, { gitDir: h.origin, parents: [original], message: "Later returned live observation" })).tip;
          const spec = `+refs/arc/work/*:refs/arc-remotes/${h.remoteName}/work/*`;
          await h.b.git(["fetch", "--refmap=", "--", h.origin, spec]);
          await h.b.git(["update-ref", seen, newer]);
          await h.remote("git", ["update-ref", "-d", ref]);
          await h.b.git(["fetch", "--prune", "--refmap=", "--", h.origin, spec]);
          expect((await h.b.git(["for-each-ref", "--format=%(refname)", tracking])).stdout).toBe("");
        } finally { await siblingRelease(); }
      };
    } });
    success(await observer.pull());
    expect(newer).toMatch(/^[0-9a-f]{40}$/u);
    expect((await h.b.git(["for-each-ref", "--format=%(objectname)", seen])).stdout.trim()).toBe(newer);
    const divergent = await plantRef(h.origin, ref, entries, { gitDir: h.origin, message: "Unrelated returned live history" });
    const notices = success(await h.b.store.pull()).pulls.flatMap(pull => pull.notices);
    expect(notices).toContainEqual(expect.objectContaining({
      kind: "history-diverged", ref, local: newer, remote: divergent.tip,
    }));
    expect((await h.b.git(["for-each-ref", "--format=%(objectname)", seen])).stdout.trim()).toBe(newer);
    const notice = notices.find(row => row.kind === "history-diverged");
    if (notice?.kind !== "history-diverged") throw new Error("Expected a rewrite repair");
    for (const line of notice.remedy.text.slice(notice.remedy.text.indexOf("Take theirs")).split("\n").slice(1)) {
      if (!line.startsWith("'git'")) break;
      const argv = [...line.matchAll(/'((?:[^']|'"'"')*)'/gu)].map(match => (match[1] ?? "").replaceAll("'\"'\"'", "'"));
      await h.b.exec("git", argv.slice(1), { cwd: h.b.root });
    }
    expect(success(await h.b.store.pull()).pulls.flatMap(pull => pull.notices).some(row => row.kind === "history-diverged")).toBe(false);
    expect((await h.b.git(["rev-parse", tracking])).stdout.trim()).toBe(divergent.tip);
  });
});

it("keeps the same-S comparison after a separate backing source changes its end and becomes read-only", async () => {
  const h = await refSyncFixture("separate");
  success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
    content: '{"projectId":"34567890-1234-4234-8234-123456789abc"}', provenance: { verb: "start", lifecycleAction: "start" } }));
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("changed-end"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "changed-end" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
  const owner = made.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a stored owner");
  const live = `refs/arc/work/${owner.uid}`, history = `refs/arc/history/work/${owner.uid}`;
  const quarter = "refs/arc/archive/2026-q4", registry = "refs/arc/project/registry";
  const prefix = `refs/arc-remotes/${h.remoteName}/`, seen = `refs/arc/tmp/seen/${h.remoteName}/work/${owner.uid}`;
  const key = `refs/arc/tmp/seen/${h.remoteName}`;
  const tip = async (ref: string) => (await h.b.git(["for-each-ref", "--format=%(objectname)", ref])).stdout.trim();
  const entries = async (ref: string) => (await h.remote("git", ["ls-tree", "-r", "--format=%(objectname) %(path)", ref])).stdout
    .trim().split("\n").filter(Boolean).map(row => ({ oid: row.slice(0, 40), path: row.slice(41), mode: "100644" as const }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const original = (await h.remote("git", ["rev-parse", live])).stdout.trim(), originalEntries = await entries(live);
  const current = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: made.reference, expected: current.version, content: current.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.a.store.push());
  const registryTip = (await h.remote("git", ["rev-parse", registry])).stdout.trim();
  expect((await entries(registry)).some(({ path }) => path.startsWith("lineage/"))).toBe(false);
  const archived = (await h.remote("git", ["rev-parse", quarter])).stdout.trim();
  const ended = (await h.remote("git", ["rev-parse", history])).stdout.trim();
  const archiveEntries = await entries(quarter);
  const metadata = archiveEntries.find(({ path }) => path.endsWith(`/metadata-${owner.uid}.json`));
  if (!metadata) throw new Error("Expected owner's archived metadata");
  const folder = metadata.path.slice(0, metadata.path.indexOf("/") + 1);
  let intervened = false, changed = "";
  const observer = createRefStore({ ...h.b.ports, lock: async (name, wait) => {
    // Public merge has applied the end before it asks for this retirement lease.
    if (name === key && !intervened && await tip(history) === ended && await tip(live) === "") {
      intervened = true;
      expect(await tip(quarter)).toBe(archived);
      expect(await tip(seen)).toBe(original);
      await h.b.git(["config", `remote.${h.remoteName}.arc-state`, "read"]);
      changed = (await plantRef(h.origin, quarter, archiveEntries.filter(({ path }) => !path.startsWith(folder)),
        { gitDir: h.origin, parents: [archived], message: "External removal of the entire archived owner folder" })).tip;
      await h.remote("git", ["update-ref", "-d", history, ended]);
      await h.remote("git", ["update-ref", live, original]);
      expect(success(await h.b.store.pull({ history: [HistoryRefSchema.parse(history)] })).pulls.flatMap(pull => pull.notices)
        .some(notice => notice.kind === "history-diverged")).toBe(false);
      expect(await tip(seen)).toBe("");
      await h.remote("git", ["update-ref", "-d", live, original]);
      success(await h.b.store.pull({ history: [HistoryRefSchema.parse(history)] }));
      expect(await tip(seen)).toBe(original);
      expect(await tip(prefix + "archive/2026-q4")).toBe(changed);
      expect(await tip(prefix + `history/work/${owner.uid}`)).toBe("");
      expect(await tip(quarter)).toBe(archived);
      expect(await tip(history)).toBe(ended);
      expect((await h.remote("git", ["rev-parse", registry])).stdout.trim()).toBe(registryTip);
    }
    return h.b.ports.lock(name, wait);
  } });
  success(await observer.pull());
  expect(intervened).toBe(true);
  expect(await tip(seen)).toBe(original);
  const unrelated = await plantRef(h.origin, live, originalEntries, { gitDir: h.origin, message: "Unrelated returned root after changed end" });
  const notices = success(await h.b.store.pull()).pulls.flatMap(pull => pull.notices);
  expect(notices).toContainEqual(expect.objectContaining({ kind: "history-diverged", ref: live, local: original, remote: unrelated.tip }));
  expect(await tip(prefix + `work/${owner.uid}`)).toBe("");
  expect(await tip(seen)).toBe(original);
  const notice = notices.find(row => row.kind === "history-diverged");
  if (notice?.kind !== "history-diverged") throw new Error("Expected a rewrite repair");
  for (const line of notice.remedy.text.slice(notice.remedy.text.indexOf("Take theirs")).split("\n").slice(1)) {
    if (!line.startsWith("'git'")) break;
    const argv = [...line.matchAll(/'((?:[^']|'"'"')*)'/gu)].map(match => (match[1] ?? "").replaceAll("'\"'\"'", "'"));
    await h.b.exec("git", argv.slice(1), { cwd: h.b.root });
  }
  expect(success(await h.b.store.pull()).pulls.flatMap(pull => pull.notices).some(row => row.kind === "history-diverged")).toBe(false);
  expect(await tip(prefix + `work/${owner.uid}`)).toBe(unrelated.tip);
}, 60_000);
