/** Binding retains the admitted generation and preserves a competing marker until a fresh retry. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { reconcileWorkUnitWorktree, nodeReconcileWorkUnitWorktreeFs } from "../../../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { makeWorktreeOccupancyGuard } from "../../../../src/lib/work-unit/lifecycle-guards.js";
import { ownerHolderRequest } from "../../../../src/lib/work-unit/locus-ports.js";
import { createLocusPorts } from "../../../../src/lib/locus/lifecycle-ports.js";
import { readWorktreeMarker, writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { worktreePorcelainZ } from "../../../helpers/worktree-porcelain.js";

it("preserves a changed unbound generation and its branch until a fresh admission", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-bind-generation-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const h = createLifecycleHarness(), primary = await h.seedMeta("example", {}, { kind: "active" },
    { branches: [{ repository: "project", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const marker = { spawnedByArc: false, createdFor: { kind: "work-unit" as const, name: "example" },
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" };
  await writeWorktreeMarker(cwd, marker);
  const guard = makeWorktreeOccupancyGuard({ cwd, store: h.store, identity: "test-user",
    readActiveMetaCandidates: async () => ({ layout: "full", candidates: [], warnings: [] }) });
  const admit = () => guard({ slug: "example", primary, admitUnbound: true, index: new Map(), position: null, inputs: {} });
  const admission = await admit();
  if (!admission.ok || admission.bind === undefined) throw new Error("Expected unbound admission");
  const changed = { ...marker, createdAt: "2026-10-25T00:00:00Z" };
  await writeWorktreeMarker(cwd, changed);
  let branch = "main";
  const exec = scriptGitExec([
    { match: ["rev-parse", "--show-toplevel"], responses: [{ stdout: cwd }] },
    { match: ["rev-parse", "--git-path", "info/exclude"], responses: [{ stdout: join(cwd, ".git/info/exclude") }] },
    { match: ["worktree", "list", "--porcelain", "-z"], responses: [() => ({ stdout: worktreePorcelainZ(`worktree ${cwd}\nHEAD ${"a".repeat(40)}\nbranch refs/heads/${branch}`) })] },
    { match: ["checkout", "feat/example"], responses: [() => { branch = "feat/example"; return { stdout: "" }; }] },
  ]).exec;
  const context = { store: h.store, exec, fs: nodeReconcileWorkUnitWorktreeFs, chdir: () => {},
    locusPorts: createLocusPorts({ cwd, exec, store: h.store }), serializeWorktreeOperation: async <T>(_path: string, operation: () => Promise<T>) => operation() };
  const op = { mutation: "spawn" as const, inPlace: true as const, branch: "feat/example", createBranch: false, wuName: "example",
    spawningIdentity: "test-user", holder: ownerHolderRequest(primary), bind: admission.bind };
  const before = lifecycleSuccess(await h.store.version());
  await expect(reconcileWorkUnitWorktree(context, op)).rejects.toThrow("marker generation changed");
  expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker: changed });
  expect(branch).toBe("main");
  const fresh = await admit();
  if (!fresh.ok || fresh.bind === undefined) throw new Error("Expected fresh unbound admission");
  expect(await reconcileWorkUnitWorktree(context, { ...op, bind: fresh.bind })).toMatchObject({ mutation: "spawn", worktreePath: cwd });
  expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker: { ...changed, createdFor: boundWorkUnitSubject(primary) } });
  expect(branch).toBe("feat/example");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});
