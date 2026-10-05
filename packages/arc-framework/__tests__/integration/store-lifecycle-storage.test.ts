/** Snapshot-port differentials at real immutable Git trees. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { createStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { createStoreLifecycleStorage } from "../../src/lib/store/lifecycle-storage.js";
import { StateVersionSchema, RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createGitTreeReadFs } from "../../src/scripts/review-gate/hosts/local/git-tree-fs.js";
import { readLifecycleSummary, createIntegrationCheckpointDependencies } from "../../src/scripts/integration/checkpoint-composition.js";
import { createIntegrationMergeDependencies } from "../../src/scripts/integration/merge-composition.js";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput, makeCommit } from "../helpers/integration.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

async function fixture() {
  const root = await createTempRepo("arc-lifecycle-storage-");
  onTestFinished(async () => cleanupTempDir(root));
  const exec = makeGitExec(root);
  const ports = createDefaultStorePorts({ checkoutRoot: root, exec, execInput: makeGitExecInput(root) });
  const store = createStore(ports);
  const storage = createStoreLifecycleStorage({ store, checkoutRoot: root });
  const put = async (path: string, content: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content);
  };
  const save = async () => { await exec("git", ["add", "."]); return makeCommit(root, "Save lifecycle records"); };
  return { root, exec, ports, store, storage, put, save };
}
const completion = "\n## Completion Notes\n\nDelivered the work unit.\n";
function changeRequestPort(head: string) {
  return {
    resolveRepository: async () => "owner/repo", readHeadRef: async () => ({ local: null, remote: head }),
    listByHead: async () => [{ number: 42, url: "https://example.test/owner/repo/pull/42", state: "OPEN" as const,
      baseRefName: "main", headRefName: "main", headRefOid: head }], searchByHeadSha: async () => [],
  };
}

describe("store lifecycle snapshot", () => {
  it("bounds saved inventory acquisition independently of snapshot record reads", async () => {
    const h = await fixture();
    const paths = [".arc/active", ".arc/backlog/planned/planned", ".arc/backlog/provisional/group/nested",
      ".arc/completed/2026-q4/01_shipped"];
    const names = ["active", "planned", "nested", "shipped"];
    for (const [i, path] of paths.entries()) {
      const name = names[i]!;
      await h.put(`${path}/meta-${name}.md`, makeMetaFixture(name, { state: i === 0 ? "Active" : i === 3 ? "Shipped" : "Planning",
        cohort: i === 2 ? "group" : null }));
      await h.put(`${path}/notes-${name}.md`, `# ${name}\n\nSaved companion\n`);
    }
    await h.save();
    const actual = h.ports.exec;
    const actualInput = h.ports.execInput;
    let inventoryReads = 0;
    let gitCalls = 0;
    h.ports.exec = async (command, args, options) => {
      gitCalls++;
      if (args[0] === "ls-tree" && args.includes("-t")) inventoryReads++;
      return actual(command, args, options);
    };
    h.ports.execInput = async (args, input, options) => {
      gitCalls++; return actualInput(args, input, options);
    };
    const snapshot = await h.storage.readSnapshot();
    const acquired = inventoryReads;
    const before = gitCalls;
    expect(acquired).toBeGreaterThan(0);
    for (let repeat = 0; repeat < 2; repeat++) for (const [i, path] of paths.entries()) {
      const name = names[i]!;
      expect(await snapshot.fs.readFile(join(h.root, `${path}/meta-${name}.md`))).toContain(`# Metadata: ${name}`);
      expect(await snapshot.fs.readFile(join(h.root, `${path}/notes-${name}.md`))).toBe(`# ${name}\n\nSaved companion`);
    }
    expect(inventoryReads).toBe(acquired);
    expect(gitCalls - before).toBeLessThanOrEqual(32);
  });
  it("isolates saved revisions, live changes, moving refs, and caller-owned listing fields", async () => {
    const h = await fixture();
    const path = ".arc/active/meta-example.md";
    const moved = ".arc/backlog/planned/example/meta-example.md";
    const original = makeMetaFixture("example");
    const updated = makeMetaFixture("example", { state: "Planning", priority: "P1" });
    await h.put(path, original);
    await h.put(".arc/active/notes-example.md", "First companion\n");
    await h.save();
    const movingHexRef = "a".repeat(64);
    await h.exec("git", ["update-ref", `refs/heads/${movingHexRef}`, "HEAD"]);
    const old = await h.storage.readSnapshot();
    const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "example" } });
    const listing = success(await h.store.list({ family: "work-item", kind: "work-item/meta", asOf: old.version }));
    if (listing.status !== "complete") throw new Error("Expected saved records");
    const fields = listing.records[0]!.fields as { priority: string };
    fields.priority = "P0";
    Object.assign(listing.records[0]!.placement!, { kind: "backlog", commitment: "planned" });
    const again = success(await h.store.list({ family: "work-item", kind: "work-item/meta", asOf: old.version }));
    expect(again).toMatchObject({ status: "complete", records: [{ fields: { priority: "P3" }, placement: { kind: "active" } }] });
    await h.put(path, updated);
    await h.put(".arc/active/notes-example.md", "Second companion\n");
    expect(success(await h.store.read({ reference })).content).toBe(updated);
    expect(await old.fs.readFile(join(h.root, path))).toBe(original.trimEnd());
    expect(success(await h.store.read({ reference, asOf: StateVersionSchema.parse("HEAD") })).content).toBe(original);
    expect(success(await h.store.read({ reference, asOf: StateVersionSchema.parse(movingHexRef) })).content).toBe(original);
    await mkdir(join(h.root, ".arc/backlog/planned/example"), { recursive: true });
    await h.exec("git", ["mv", path, moved]);
    await h.exec("git", ["mv", ".arc/active/notes-example.md", ".arc/backlog/planned/example/notes-example.md"]);
    await h.save();
    await h.exec("git", ["update-ref", `refs/heads/${movingHexRef}`, "HEAD"]);
    expect(success(await h.store.read({ reference, asOf: StateVersionSchema.parse("HEAD") })).content).toBe(updated);
    expect(success(await h.store.read({ reference, asOf: StateVersionSchema.parse(movingHexRef) })).content).toBe(updated);
    const next = await h.storage.readSnapshot();
    expect(next.version).not.toBe(old.version);
    for (const snapshot of [old, next, old, next]) {
      const isOld = snapshot.version === old.version;
      expect(await snapshot.fs.readFile(join(h.root, isOld ? path : moved))).toBe((isOld ? original : updated).trimEnd());
      expect(await snapshot.fs.readFile(join(h.root, isOld ? ".arc/active/notes-example.md"
        : ".arc/backlog/planned/example/notes-example.md"))).toBe(isOld ? "First companion" : "Second companion");
    }
    expect(success(await h.store.read({ reference, asOf: StateVersionSchema.parse("HEAD") })).content).toBe(updated);
    await expect(next.fs.readFile(join(h.root, ".arc/backlog/planned/example/spec-example.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("keeps filtered duplicate selection separate from the full saved inventory", async () => {
    const h = await fixture();
    await h.put(".arc/active/meta-example.md", makeMetaFixture("example"));
    await h.put(".arc/backlog/planned/example/meta-example.md", makeMetaFixture("example", { state: "Planning" }));
    const asOf = StateVersionSchema.parse(await h.save());
    await h.store.version();
    const input = { family: "work-item" as const, kind: "work-item/meta" as const, asOf };
    for (const filter of [undefined, { heldHere: true, locations: ["planned" as const] }, undefined]) {
      expect(success(await h.store.list({ ...input, filter }))).toMatchObject({ status: "complete", records: [{
        placement: filter === undefined ? { kind: "active" } : { kind: "backlog", commitment: "planned" },
      }] });
    }
  });
  it("reconsiders duplicate selection after a denied saved meta is repaired", async () => {
    const h = await fixture();
    const completed = ".arc/completed/2026-q4/01_example/meta-example.md";
    await h.put(completed, makeMetaFixture("example", { state: "Shipped" }));
    await h.put(".arc/backlog/planned/example/meta-example.md", makeMetaFixture("example", { state: "Planning" }));
    await h.save();
    const actual = h.ports.exec;
    const failure = Object.assign(new Error("Read access denied"), { code: "EACCES" });
    const target = ":(literal).arc/backlog/planned/example/meta-example.md";
    h.ports.exec = async (command, args, options) => {
      if (args[0] === "ls-tree" && args.includes(target)) throw failure;
      return actual(command, args, options);
    };
    const denied = await h.storage.readSnapshot();
    expect(await denied.fs.readFile(join(h.root, completed))).toContain("`Shipped`");
    h.ports.exec = actual;
    const restored = await h.storage.readSnapshot();
    expect(restored.version).toBe(denied.version);
    expect(await restored.fs.readFile(join(h.root, ".arc/backlog/planned/example/meta-example.md"))).toContain("`Planning`");
    await expect(restored.fs.readFile(join(h.root, completed))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it.each([true, false])("uses original omission evidence only for an in-repo store (%s)", async (stateOffBranch) => {
    const h = await fixture();
    await h.put("README.md", "Repository fixture\n");
    await h.save();
    let reads = 0;
    const storage = createStoreLifecycleStorage({ checkoutRoot: h.root, store: { ...h.store,
      capabilities: { stateOffBranch }, read: async () => { reads++; throw new Error("An omission is not reclassified by rereading"); },
      list: async () => ({ status: "ok", result: { status: "complete", records: [], missed: true,
        diagnostics: [{ kind: "malformed", key: ".arc/completed/2026-Q4/01_example/meta-example.md", rule: "placement",
          condition: "Unplaceable valid meta", remedy: { text: "Repair placement, then retry." } }] } }) } });
    if (stateOffBranch) await expect(storage.readSnapshot()).rejects.toMatchObject({ code: "store.lifecycle-incomplete" });
    else await expect(storage.readSnapshot()).resolves.toBeDefined();
    expect(reads).toBe(0);
  });
  for (const surface of ["archive", "planning"] as const) {
    it.each(["parser", "placement", "compound"] as const)(`preserves ${surface} %s diagnostic evidence in deciding ports and repairs`, async (fault) => {
      const h = await fixture();
      await h.put(".arc/system/arc-config.yml", "archive.cadence: with-integration\n");
      await h.put(".arc/completed/2026-q4/01_example/meta-example.md", makeMetaFixture("example", { state: "Shipped" }) + completion);
      const valid = surface === "archive" ? ".arc/completed/2026-q4/02_broken/meta-broken.md"
        : ".arc/backlog/planned/broken/meta-broken.md";
      const misplaced = surface === "archive" ? ".arc/completed/2026-Q4/02_broken/meta-broken.md"
        : ".arc/backlog/planned/other/meta-broken.md";
      const path = fault === "parser" ? valid : misplaced;
      const content = makeMetaFixture("broken", { state: surface === "archive" ? "Shipped" : "Planning" }) + completion;
      await h.put(path, fault === "placement" ? content : content.replace("- **Design:** [none]", "- **Design:** [TBD]"));
      const head = await h.save();
      const listing = await h.store.list({ family: "work-item", kind: "work-item/meta", asOf: StateVersionSchema.parse(head) });
      expect(listing).toMatchObject({ status: "ok", result: { status: "complete", missed: true,
        diagnostics: [expect.objectContaining({ key: path, kind: "malformed" })] } });
      if (listing.status !== "ok" || listing.result.status !== "complete") throw new Error("Expected diagnostic evidence");
      const diagnostic = listing.result.diagnostics[0];
      if (fault === "placement") expect(diagnostic).toHaveProperty("rule", "placement");
      else expect(diagnostic).not.toHaveProperty("rule");
      const checkpoint = createIntegrationCheckpointDependencies({ cwd: h.root, exec: h.exec });
      const merge = createIntegrationMergeDependencies({ cwd: h.root, exec: h.exec, workUnit: "example", changeRequestPort: changeRequestPort(head) });
      const reads = [() => h.storage.readSnapshot(), () => checkpoint.readLifecycle("example"), () => merge.readStatus("example")];
      for (const read of reads) {
        if (fault === "placement") await expect(read()).resolves.toBeDefined();
        else await expect(read()).rejects.toMatchObject({ code: "store.lifecycle-incomplete", message: expect.stringContaining(path) });
      }
      await h.put(path, content);
      const repaired = await h.save();
      expect((await h.storage.readSnapshot()).version).toBe(repaired);
      expect(await checkpoint.readLifecycle("example")).toMatchObject({ complete: true, storageVersion: repaired });
      expect(await merge.readStatus("example")).toMatchObject({ lifecycleComplete: true, lifecycleVersion: repaired });
    });
  }
  it("matches the legacy lifecycle summary and bytes at a pinned state across every placement", async () => {
    const h = await fixture();
    const cases = [
      ["active", ".arc/active/meta-active.md", "Integrating", null, "manual"],
      ["planned", ".arc/backlog/planned/planned/meta-planned.md", "Planning", null, "manual"],
      ["nested", ".arc/backlog/provisional/group/sub/nested/meta-nested.md", "Planning", "group/sub", "manual"],
      ["shipped", ".arc/completed/2026-q4/01_shipped/meta-shipped.md", "Shipped", null, "with-integration"],
    ] as const;
    for (const [name, path, state, cohort] of cases) await h.put(path, makeMetaFixture(name, { state, cohort }) + completion);
    const head = await h.save();
    await h.put(".arc/active/meta-active.md", makeMetaFixture("active").replace("`Active`", "`Unknown`"));
    const snapshot = await h.storage.readSnapshot();
    expect(snapshot.version).toBe(head);
    const legacy = createGitTreeReadFs({ cwd: h.root, revision: head, exec: h.exec });
    for (const [name, path, , , cadence] of cases) {
      expect(await readLifecycleSummary(h.root, name, cadence, snapshot.version, snapshot.fs))
        .toEqual(await readLifecycleSummary(h.root, name, cadence, head, legacy));
      expect(await snapshot.fs.readFile(join(h.root, path))).toBe(await legacy.readFile(join(h.root, path)));
    }
  });
  it("projects only selected record directories and omits both specified legacy-only metas", async () => {
    const h = await fixture();
    await h.put(".arc/active/README.md", "Not a record");
    await h.put(".arc/completed/2026-q4/index.md", "Not a record");
    await h.put(".arc/completed/2026-q4/02_empty/README.md", "No meta");
    await h.put(".arc/completed/2026-q4/01_example/meta-example.md", makeMetaFixture("example", { state: "Shipped" }) + completion);
    await h.put(".arc/backlog/planned/example/meta-example.md", makeMetaFixture("example", { state: "Planning" }).replace("`Planning`", "`Unknown`"));
    await h.put(".arc/completed/2026-Q4/01_upper/meta-upper.md", makeMetaFixture("upper", { state: "Shipped" }) + completion);
    await h.put(".arc/active/meta-rejected.md", makeMetaFixture("rejected").replace("`Active`", "`Unknown`"));
    await h.put(".arc/completed/2026-q4/03_rejected/meta-rejected.md", makeMetaFixture("rejected", { state: "Shipped" }) + completion);
    const head = await h.save();
    const listing = await h.store.list({ family: "work-item", kind: "work-item/meta", asOf: StateVersionSchema.parse(head) });
    expect(listing).toMatchObject({ status: "ok", result: { status: "complete", missed: true,
      diagnostics: [expect.objectContaining({ key: ".arc/completed/2026-Q4/01_upper/meta-upper.md" })] } });
    const snapshot = await h.storage.readSnapshot();
    const legacy = createGitTreeReadFs({ cwd: h.root, revision: head, exec: h.exec });
    expect((await snapshot.fs.readdir(join(h.root, ".arc/completed/2026-q4"))).map((entry) => entry.name)).toEqual(["01_example"]);
    await expect(snapshot.fs.readdir(join(h.root, ".arc/backlog/planned/example"))).rejects.toMatchObject({ code: "ENOENT" });
    for (const name of ["upper", "rejected"]) {
      expect(await readLifecycleSummary(h.root, name, "with-integration", snapshot.version, snapshot.fs)).toMatchObject({ state: "nonexistent" });
      expect(await readLifecycleSummary(h.root, name, "with-integration", head, legacy)).toMatchObject({ state: "shipped" });
    }
    await expect(snapshot.fs.readFile(join(h.root, ".arc/completed/2026-q4/index.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("uses Store snapshots for both production compositions while retaining injected ports", async () => {
    const h = await fixture();
    await h.put(".arc/system/arc-config.yml", "archive.cadence: manual\n");
    await h.put(".arc/active/meta-example.md", makeMetaFixture("example", { state: "Integrating" }) + completion);
    const head = await h.save();
    await h.put(".arc/completed/2026-Q4/01_upper/meta-upper.md", makeMetaFixture("upper", { state: "Shipped" }) + completion);
    const next = await h.save();
    const checkpoint = createIntegrationCheckpointDependencies({ cwd: h.root, exec: h.exec });
    expect(await checkpoint.readLifecycle("example")).toMatchObject({ storageVersion: next, complete: true });
    expect(await checkpoint.readLifecycle("upper")).toMatchObject({ state: "nonexistent" });
    const injected = createIntegrationCheckpointDependencies({ cwd: h.root, exec: h.exec,
      lifecycleStorage: { readSnapshot: async () => ({ version: head, fs: createGitTreeReadFs({ cwd: h.root, revision: head, exec: h.exec }) }) } });
    expect(await injected.readLifecycle("example")).toMatchObject({ storageVersion: head, complete: true });
    await h.put(".arc/system/arc-config.yml", "archive.cadence: with-integration\n");
    const mergeHead = await h.save();
    const merge = createIntegrationMergeDependencies({ cwd: h.root, exec: h.exec, workUnit: "upper", changeRequestPort: changeRequestPort(mergeHead) });
    expect(await merge.readStatus("upper")).toMatchObject({ lifecycleVersion: mergeHead, lifecycleComplete: false });
    const legacyMerge = createIntegrationMergeDependencies({ cwd: h.root, exec: h.exec, workUnit: "upper", changeRequestPort: changeRequestPort(mergeHead),
      lifecycleStorage: { readSnapshot: async () => ({ version: mergeHead,
        fs: createGitTreeReadFs({ cwd: h.root, revision: mergeHead, exec: h.exec }) }) } });
    expect(await legacyMerge.readStatus("upper")).toMatchObject({ lifecycleVersion: mergeHead, lifecycleComplete: true });
  });
  it("refuses missed lifecycle evidence in snapshots and default deciding ports, then resumes after repair", async () => {
    const h = await fixture();
    const broken = ".arc/active/meta-broken.md";
    await h.put(".arc/system/arc-config.yml", "archive.cadence: with-integration\n");
    await h.put(".arc/completed/2026-q4/01_example/meta-example.md", makeMetaFixture("example", { state: "Shipped" }) + completion);
    await h.put(".arc/completed/2026-Q4/01_upper/meta-upper.md", makeMetaFixture("upper", { state: "Shipped" }) + completion);
    await h.put(".arc/active/meta-rejected.md", makeMetaFixture("rejected").replace("`Active`", "`Unknown`"));
    await h.put(".arc/completed/2026-q4/02_rejected/meta-rejected.md", makeMetaFixture("rejected", { state: "Shipped" }) + completion);
    await h.put(broken, makeMetaFixture("broken").replace("- **Design:** [none]", "- **Design:** [TBD]"));
    const head = await h.save();
    const checkpoint = createIntegrationCheckpointDependencies({ cwd: h.root, exec: h.exec });
    const merge = createIntegrationMergeDependencies({ cwd: h.root, exec: h.exec, workUnit: "example", changeRequestPort: changeRequestPort(head) });
    for (const read of [() => h.storage.readSnapshot(), () => checkpoint.readLifecycle("example"), () => merge.readStatus("example")]) {
      await expect(read()).rejects.toMatchObject({ code: "store.lifecycle-incomplete", message: expect.stringContaining(broken) });
      await expect(read()).rejects.toThrow(/Repair.*then/);
    }
    await h.put(broken, makeMetaFixture("broken"));
    const repaired = await h.save();
    const snapshot = await h.storage.readSnapshot();
    expect(snapshot.version).toBe(repaired);
    expect(await checkpoint.readLifecycle("example")).toMatchObject({ storageVersion: repaired, complete: true });
    expect(await merge.readStatus("example")).toMatchObject({ lifecycleVersion: repaired, lifecycleComplete: true });
    for (const name of ["upper", "rejected"]) {
      expect(await readLifecycleSummary(h.root, name, "with-integration", repaired, snapshot.fs)).toMatchObject({ state: "nonexistent" });
    }
  });
  it.each([true, false])("refuses either missed evidence or diagnostics even if the other signal is absent (%s)", async (missed) => {
    const h = await fixture();
    await h.put("README.md", "Repository fixture\n");
    await h.save();
    const diagnostics = missed ? [] : [{ kind: "unreadable" as const, key: "one-record", condition: "Record access denied",
      remedy: { text: "Restore access, then retry." } }];
    const storage = createStoreLifecycleStorage({ checkoutRoot: h.root, store: { ...h.store,
      list: async () => ({ status: "ok", result: { status: "complete", records: [], missed, diagnostics } }) } });
    await expect(storage.readSnapshot()).rejects.toMatchObject({ code: "store.lifecycle-incomplete" });
    await expect(storage.readSnapshot()).rejects.toThrow(missed ? /missed.*Repair/ : /Record access denied.*Restore access/);
  });
});
