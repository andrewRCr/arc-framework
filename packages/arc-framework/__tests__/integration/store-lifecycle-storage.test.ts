/** Snapshot-port differentials at real immutable Git trees. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { createStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { createStoreLifecycleStorage } from "../../src/lib/store/lifecycle-storage.js";
import { createGitTreeReadFs } from "../../src/scripts/review-gate/hosts/local/git-tree-fs.js";
import { readLifecycleSummary, createIntegrationCheckpointDependencies } from "../../src/scripts/integration/checkpoint-composition.js";
import { createIntegrationMergeDependencies } from "../../src/scripts/integration/merge-composition.js";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput, makeCommit } from "../helpers/integration.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

async function fixture() {
  const root = await createTempRepo("arc-lifecycle-storage-");
  onTestFinished(async () => cleanupTempDir(root));
  const exec = makeGitExec(root);
  const store = createStore(createDefaultStorePorts({ checkoutRoot: root, exec, execInput: makeGitExecInput(root) }));
  const storage = createStoreLifecycleStorage({ store, checkoutRoot: root });
  const put = async (path: string, content: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content);
  };
  const save = async () => { await exec("git", ["add", "."]); return makeCommit(root, "Save lifecycle records"); };
  return { root, exec, store, storage, put, save };
}
const completion = "\n## Completion Notes\n\nDelivered the work unit.\n";

describe("store lifecycle snapshot", () => {
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
    const changeRequestPort = {
      resolveRepository: async () => "owner/repo", readHeadRef: async () => ({ local: null, remote: mergeHead }),
      listByHead: async () => [{ number: 42, url: "https://example.test/owner/repo/pull/42", state: "OPEN" as const,
        baseRefName: "main", headRefName: "main", headRefOid: mergeHead }], searchByHeadSha: async () => [],
    };
    const merge = createIntegrationMergeDependencies({ cwd: h.root, exec: h.exec, workUnit: "upper", changeRequestPort });
    expect(await merge.readStatus("upper")).toMatchObject({ lifecycleVersion: mergeHead, lifecycleComplete: false });
    const legacyMerge = createIntegrationMergeDependencies({ cwd: h.root, exec: h.exec, workUnit: "upper", changeRequestPort,
      lifecycleStorage: { readSnapshot: async () => ({ version: mergeHead,
        fs: createGitTreeReadFs({ cwd: h.root, revision: mergeHead, exec: h.exec }) }) } });
    expect(await legacyMerge.readStatus("upper")).toMatchObject({ lifecycleVersion: mergeHead, lifecycleComplete: true });
  });
});
