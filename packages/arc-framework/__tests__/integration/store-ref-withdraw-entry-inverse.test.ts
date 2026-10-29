import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { ConflictRecordSchema } from "../../src/lib/store/conflict.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";

const ownQuarter = ArchiveQuarterSchema.parse("2027-q1"), remoteQuarter = ArchiveQuarterSchema.parse("2026-q4");
const provenance = { verb: "archive", lifecycleAction: "archive" };
const entry = (text: string, id = "11111111") => `### **Concern**\n\n- _Id:_ \`${id}\`\n\n${text}\n`;
const old = entry("Original concern."), changed = entry("Batch edit."), later = entry("Later local edit.");

async function stateRefs(side: RefSyncFixture["a"]): Promise<string> {
  return (await side.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout
    .split("\n").filter(row => !row.startsWith("refs/arc/tmp/")).join("\n");
}

function scenarios(empty: string) {
  return [
    { name: "addition", common: empty, before: empty, after: empty + old, published: empty, expected: empty },
    { name: "addition beside a later entry", common: empty, before: empty, after: empty + old,
      current: empty + old + "\n" + entry("Later concern.", "22222222"), published: empty, expected: empty + entry("Later concern.", "22222222") },
    { name: "edit", common: empty + old, before: empty + old, after: empty + changed, published: empty + old, expected: empty + old },
    { name: "removal absent from ancestor", common: empty, before: empty + old, after: empty, published: empty, expected: empty + old },
    { name: "removal present in ancestor", common: empty + old, before: empty + old, after: empty, published: empty, expected: empty },
    { name: "published edit", common: empty + old, before: empty + old, after: empty + changed, published: empty + changed, expected: empty + changed },
    { name: "later edit", common: empty + old, before: empty + old, after: empty + changed, current: empty + later, published: empty + old, expected: empty + later },
    { name: "prose", common: empty, before: empty, after: empty.replace("Inbox", "Batch prose Inbox"), published: empty, expected: empty },
    { name: "prose clash", common: empty, before: empty.replace("Inbox", "Before Inbox"),
      after: empty.replace("Inbox", "Batch Inbox"), published: empty.replace("Inbox", "Published Inbox"), expected: empty.replace("Inbox", "Published Inbox") },
    { name: "order", common: empty + old + "\n" + entry("Other concern.", "22222222"),
      before: empty + old + "\n" + entry("Other concern.", "22222222"), after: empty + entry("Other concern.", "22222222") + "\n" + old,
      published: empty + old + "\n" + entry("Other concern.", "22222222"), expected: empty + old + "\n" + entry("Other concern.", "22222222") },
    { name: "published change beside mixed edits", common: empty + old + "\n" + entry("Other concern.", "22222222"),
      before: empty + old + "\n" + entry("Other concern.", "22222222"), after: empty + changed + "\n" + entry("Added concern.", "33333333"),
      published: empty + old + "\n" + entry("Published concern.", "22222222"), expected: empty + old + "\n" + entry("Published concern.", "22222222") },
    { name: "mixed", common: empty + old + "\n" + entry("Removed concern.", "22222222"),
      before: empty + old + "\n" + entry("Removed concern.", "22222222"),
      after: empty + changed + "\n" + entry("Added concern.", "33333333"),
      published: empty + old + "\n" + entry("Removed concern.", "22222222"),
      expected: empty + old + "\n" + entry("Removed concern.", "22222222") },
  ];
}

describe.each(["default", "separate"] as const)("whole withdrawal entry inverse in %s", layout => {
  it("holds a restored file beside a later child until the child is repaired forward", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "collision-inverse" }, kind: "work-item/meta" }),
      content: makeMetaFixture("collision-inverse"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const parent = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "removed" });
    const child = RecordReferenceSchema.parse({ ...parent, key: "removed.andrew/later" });
    const home = expandStoredPath(parent, { registry: createKindRegistry(PRODUCTION_REGISTRATIONS) });
    success(await h.a.store.write({ action: "put", reference: parent, expected: null, content: "Original parent.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const primary = success(await h.a.store.read({ reference: made.reference })), original = success(await h.a.store.read({ reference: parent }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
      { action: "remove", reference: parent, expected: original.version },
    ], provenance }));
    success(await h.a.store.write({ action: "put", reference: child, expected: null, content: "Retained child.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
    const remote = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: remote.content,
      placement: { kind: "completed", quarter: remoteQuarter }, provenance }));
    success(await h.b.store.push());
    if (made.reference.owner.type !== "work-item" || !made.reference.owner.uid) throw new Error("Expected a minted owner");
    const history = `refs/arc/history/work/${made.reference.owner.uid}`, locked = new Set<string>();
    const snapshots: { refs: string; afterRefs: string; objects: string; afterObjects: string }[] = [];
    const observing = createRefStore({ ...h.a.ports, lock: async (ref, wait) => {
      const release = await h.a.ports.lock(ref, wait);
      locked.add(ref);
      const complete = ref === home.ref && locked.has(history) && locked.has(`refs/arc/archive/${ownQuarter}`);
      const refs = complete ? await stateRefs(h.a) : "", objects = complete ? (await h.a.git(["count-objects", "-v"])).stdout : "";
      return async () => {
        if (complete) snapshots.push({ refs, objects, afterRefs: await stateRefs(h.a), afterObjects: (await h.a.git(["count-objects", "-v"])).stdout });
        locked.delete(ref);
        await release();
      };
    } });
    const notices = success(await observing.pull()).pulls.flatMap(({ notices }) => notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref,
      condition: expect.stringContaining("removed.andrew"), remedy: { text: expect.stringMatching(/repair|rename|remove/iu) } }));
    expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(snapshots.length).toBeGreaterThan(0);
    for (const snapshot of snapshots) {
      expect(snapshot.afterRefs).toBe(snapshot.refs);
      expect(snapshot.afterObjects).toBe(snapshot.objects);
    }
    const retained = success(await h.a.store.read({ reference: child }));
    expect(retained.content).toBe("Retained child.\n");
    expect(await h.a.store.read({ reference: parent })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await h.a.store.write({ action: "remove", reference: child, expected: retained.version, provenance: { verb: "save", lifecycleAction: "save" } }));
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(success(await h.a.store.read({ reference: parent })).content).toBe("Original parent.\n");
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
  });
  describe.each(["project", "personal"] as const)("%s inbox", scope => {
    const empty = scope === "project" ? "# Atomic Inbox\n\n## Inbox\n\n" : "# User Inbox\n\n## Errand\n\n## Work Unit\n\n";
    it.each(scenarios(empty))("withdraws $name using original and published ancestry", async scenario => {
      const h = await refSyncFixture(layout);
      const made = success(await h.a.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "entry-inverse" }, kind: "work-item/meta" }),
        content: makeMetaFixture("entry-inverse"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
      const reference = RecordReferenceSchema.parse({ owner: scope === "project" ? { type: "project", name: "project" } : { type: "person", name: "andrew" },
        kind: scope === "project" ? "project-inbox/inbox" : "personal/inbox" });
      const common = success(await h.a.store.write({ action: "put", reference, expected: null, content: scenario.common, provenance }));
      success(await h.a.store.push()); success(await h.b.store.pull());
      if (scenario.before !== scenario.common) {
        const record = success(await h.a.store.read({ reference }));
        success(await h.a.store.write({ action: "put", reference, expected: record.version, content: scenario.before, provenance }));
      }
      const close = async (side: typeof h.a, quarter: typeof ownQuarter, content: string) => {
        const primary = success(await side.store.read({ reference: made.reference })), inbox = success(await side.store.read({ reference }));
        return success(await side.store.batch({ writes: [
          { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter } },
          { action: "put", reference, expected: inbox.version, content },
        ], provenance }));
      };
      const written = await close(h.a, ownQuarter, scenario.after);
      if (scenario.current) {
        const record = success(await h.a.store.read({ reference }));
        success(await h.a.store.write({ action: "put", reference, expected: record.version, content: scenario.current, provenance: { verb: "save", lifecycleAction: "save" } }));
      }
      await close(h.b, remoteQuarter, scenario.published); success(await h.b.store.push());
      const pulled = success(await h.a.store.pull());
      expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      const record = success(await h.a.store.read({ reference }));
      expect(record.content).toBe(scenario.expected);
      if (scenario.name === "later edit") {
        const clashes = await Promise.all(record.conflicts.map(async reference => ConflictRecordSchema.parse(JSON.parse(success(await h.a.store.read({ reference })).content))));
        expect(clashes).toContainEqual(expect.objectContaining({ location: { kind: "entry", id: "11111111" }, base: changed.trimEnd(),
          current: expect.objectContaining({ content: later.trimEnd(), label: expect.objectContaining({ actor: h.a.carry().actor }) }),
          incoming: expect.objectContaining({ content: old.trimEnd() }) }));
      }
      if (scenario.name === "prose clash") {
        const clashes = await Promise.all(record.conflicts.map(async reference => ConflictRecordSchema.parse(JSON.parse(success(await h.a.store.read({ reference })).content))));
        expect(clashes).toContainEqual(expect.objectContaining({ location: expect.objectContaining({ kind: "hunk" }), baseVersion: common.version,
          current: expect.objectContaining({ content: expect.stringContaining("Before Inbox"), label: expect.objectContaining({ actor: h.a.carry().actor }) }),
          incoming: expect.objectContaining({ content: expect.stringContaining("Published Inbox"), label: expect.objectContaining({ actor: h.b.carry().actor }) }) }));
        expect(clashes).toContainEqual(expect.objectContaining({ location: expect.objectContaining({ kind: "hunk" }), baseVersion: written.writes[1]?.version,
          current: expect.objectContaining({ content: expect.stringContaining("Published Inbox"), label: expect.objectContaining({ actor: h.b.carry().actor }) }),
          incoming: expect.objectContaining({ content: expect.stringContaining("Before Inbox"), label: expect.objectContaining({ actor: h.a.carry().actor }) }) }));
      }
      expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    });

    it.each(["removal", "recreation"] as const)("retains a later whole-document %s under the existing record policy", async action => {
      const h = await refSyncFixture(layout);
      const made = success(await h.a.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "whole-record-inverse" }, kind: "work-item/meta" }),
        content: makeMetaFixture("whole-record-inverse"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
      const reference = RecordReferenceSchema.parse({ owner: scope === "project" ? { type: "project", name: "project" } : { type: "person", name: "andrew" },
        kind: scope === "project" ? "project-inbox/inbox" : "personal/inbox" });
      success(await h.a.store.write({ action: "put", reference, expected: null, content: empty + old, provenance }));
      success(await h.a.store.push()); success(await h.b.store.pull());
      const primary = success(await h.a.store.read({ reference: made.reference })), inbox = success(await h.a.store.read({ reference }));
      success(await h.a.store.batch({ writes: [
        { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
        action === "removal" ? { action: "put", reference, expected: inbox.version, content: empty + changed } : { action: "remove", reference, expected: inbox.version },
      ], provenance }));
      if (action === "removal") {
        const written = success(await h.a.store.read({ reference }));
        success(await h.a.store.write({ action: "remove", reference, expected: written.version, provenance: { verb: "save", lifecycleAction: "save" } }));
      } else success(await h.a.store.write({ action: "put", reference, expected: null, content: empty + later, provenance: { verb: "save", lifecycleAction: "save" } }));
      const remote = success(await h.b.store.read({ reference: made.reference }));
      success(await h.b.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: remote.content,
        placement: { kind: "completed", quarter: remoteQuarter }, provenance }));
      success(await h.b.store.push());
      expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      if (action === "removal") expect(await h.a.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      else expect(success(await h.a.store.read({ reference }))).toMatchObject({ content: empty + later, conflicts: [] });
      expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    });

    if (scope === "personal") it("restores a moved entry's original section", async () => {
      const h = await refSyncFixture(layout);
      const made = success(await h.a.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "section-inverse" }, kind: "work-item/meta" }),
        content: makeMetaFixture("section-inverse"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
      const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/inbox" });
      const before = "# User Inbox\n\n## Errand\n\n" + old + "\n## Work Unit\n\n";
      success(await h.a.store.write({ action: "put", reference, expected: null, content: before, provenance }));
      success(await h.a.store.push()); success(await h.b.store.pull());
      const primary = success(await h.a.store.read({ reference: made.reference })), inbox = success(await h.a.store.read({ reference }));
      success(await h.a.store.batch({ writes: [
        { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
        { action: "put", reference, expected: inbox.version, content: empty + old },
      ], provenance }));
      const remote = success(await h.b.store.read({ reference: made.reference }));
      success(await h.b.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: remote.content,
        placement: { kind: "completed", quarter: remoteQuarter }, provenance }));
      success(await h.b.store.push());
      expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      expect(success(await h.a.store.read({ reference })).content).toBe(before);
    });

    it.each(["tree", "blob", "commit", "label walk", "journal walk", "unrelated failure", "completed failure", "readable diagnostic"] as const)("holds unavailable ancestor %s before any inverse write and retries after exact restoration", async damage => {
      const h = await refSyncFixture(layout);
      const made = success(await h.a.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "ancestor-inverse" }, kind: "work-item/meta" }),
        content: makeMetaFixture("ancestor-inverse"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
      const reference = RecordReferenceSchema.parse({ owner: scope === "project" ? { type: "project", name: "project" } : { type: "person", name: "andrew" },
        kind: scope === "project" ? "project-inbox/inbox" : "personal/inbox" });
      const home = expandStoredPath(reference, { registry: createKindRegistry(PRODUCTION_REGISTRATIONS) });
      success(await h.a.store.write({ action: "put", reference, expected: null, content: empty + old, provenance }));
      const common = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
      // The label walk loses the common tree only once the entry label reads history, after every other ancestor read.
      const treeDamage = damage === "tree" || damage === "label walk";
      // The journal walk loses the common commit as discovery first reads each held ref's history, before any lock.
      const commitDamage = damage === "commit" || damage === "journal walk";
      const oid = (await h.a.git(["rev-parse", commitDamage ? common : treeDamage ? `${common}^{tree}` : `${common}:${home.path}`])).stdout.trim();
      const gitScope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
      const type = commitDamage ? "commit" : treeDamage ? "tree" : "blob";
      const unavailable = treeDamage || commitDamage || damage === "blob";
      const bytes = (await h.a.ports.rawExec([...gitScope, "cat-file", type, oid], { cwd: h.a.root, objectAccess: "local-only" })).stdout;
      success(await h.a.store.push()); success(await h.b.store.pull());
      const original = success(await h.a.store.read({ reference }));
      success(await h.a.store.write({ action: "put", reference, expected: original.version, content: empty + entry("Before batch."), provenance }));
      const before = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
      const close = async (side: typeof h.a, quarter: typeof ownQuarter, content: string) => {
        const primary = success(await side.store.read({ reference: made.reference })), inbox = success(await side.store.read({ reference }));
        success(await side.store.batch({ writes: [
          { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter } },
          { action: "put", reference, expected: inbox.version, content },
        ], provenance }));
      };
      await close(h.a, ownQuarter, empty + changed); await close(h.b, remoteQuarter, empty + entry("Published concern."));
      const incoming = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
      success(await h.b.store.push());
      if (made.reference.owner.type !== "work-item" || !made.reference.owner.uid) throw new Error("Expected a minted owner");
      const live = `refs/arc/work/${made.reference.owner.uid}`, locked = new Set<string>();
      const requiredLocks = [home.ref, live, live.replace("refs/arc/", "refs/arc/history/"), `refs/arc/archive/${ownQuarter}`, "refs/arc/project/registry"];
      let refs: string | undefined, objects: string | undefined, damaged = false;
      const failure = damage === "unrelated failure" ? new Error("Unrelated withdrawal graph executor failure")
        : makeGitProcessError({ command: "git", args: ["merge-base", before, incoming], exitCode: 128,
          stderr: damage === "readable diagnostic" ? `fatal: Could not read ${common}\n` : "fatal: permission denied reading repository configuration\n" });
      const observing = createRefStore({ ...h.a.ports, lock: async (ref, wait) => {
        const release = await h.a.ports.lock(ref, wait);
        locked.add(ref);
        if (!damaged && unavailable && damage !== "label walk" && damage !== "journal walk" && requiredLocks.every(ref => locked.has(ref))) {
          damaged = true;
          await removeLooseObject(h.a.root, oid, h.a.gitDir);
          refs = await stateRefs(h.a);
          objects = (await h.a.git(["count-objects", "-v"])).stdout;
        }
        return async () => { locked.delete(ref); await release(); };
      }, exec: async (command, args, options) => {
        const walk = damage === "label walk" ? args.includes(`:(literal)${home.path}`) : damage === "journal walk" && args.includes("--first-parent") && args.includes("--format=%H %P%n%B%x00");
        if (!damaged && walk && args.includes("log")) {
          damaged = true;
          await removeLooseObject(h.a.root, oid, h.a.gitDir);
          refs = await stateRefs(h.a);
          objects = (await h.a.git(["count-objects", "-v"])).stdout;
        }
        if (!damaged && !unavailable && args.includes("merge-base") && args.includes(before) && args.includes(incoming)) {
          damaged = true;
          refs = await stateRefs(h.a);
          objects = (await h.a.git(["count-objects", "-v"])).stdout;
          throw failure;
        }
        return h.a.ports.exec(command, args, options);
      } });
      if (!unavailable) await expect(observing.pull()).rejects.toBe(failure);
      else {
        const notices = success(await observing.pull()).pulls.flatMap(({ notices }) => notices);
        expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref, remedy: { text: expect.stringMatching(/restore|fetch/iu) } }));
        expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      }
      expect(damaged).toBe(true);
      expect(await stateRefs(h.a)).toBe(refs);
      expect((await h.a.git(["count-objects", "-v"])).stdout).toBe(objects);
      if (unavailable) await h.a.ports.rawExec([...gitScope, "hash-object", "-t", type, "-w", "--stdin"],
        { cwd: h.a.root, input: bytes, objectAccess: "local-only" });
      expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      const record = success(await h.a.store.read({ reference }));
      expect(record.content).toBe(empty + entry("Published concern."));
      const clashes = await Promise.all(record.conflicts.map(async reference => ConflictRecordSchema.parse(JSON.parse(success(await h.a.store.read({ reference })).content))));
      expect(clashes).toContainEqual(expect.objectContaining({ location: { kind: "entry", id: "11111111" },
        current: expect.objectContaining({ content: entry("Before batch.").trimEnd(), label: expect.objectContaining({ actor: h.a.carry().actor }) }),
        incoming: expect.objectContaining({ content: entry("Published concern.").trimEnd(), label: expect.objectContaining({ actor: h.b.carry().actor }) }) }));
      expect(clashes).toContainEqual(expect.objectContaining({ location: { kind: "entry", id: "11111111" },
        current: expect.objectContaining({ content: entry("Published concern.").trimEnd(), label: expect.objectContaining({ actor: h.b.carry().actor }) }),
        incoming: expect.objectContaining({ content: entry("Before batch.").trimEnd(), label: expect.objectContaining({ actor: h.a.carry().actor }) }) }));
      expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    });
  });
});
