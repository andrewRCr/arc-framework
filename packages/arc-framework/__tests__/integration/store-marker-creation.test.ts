/** Creation binds minted owners after committing records and preserves concurrent markers. */
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, readWorktreeMarker, resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

async function fixture(here: boolean) {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: randomUUID() })), "{}");
  const path = join(f.cwd, ".arc-checkouts", "created"), configPath = join(f.cwd, ".arc/system/arc-config.yml");
  await writeFile(configPath, (await readFile(configPath, "utf8")).replace(/^worktree.location_template:.*$/mu,
    `worktree.location_template: ${path}`));
  await f.exec("git", ["add", ".arc/system/arc-config.yml"]);
  await f.exec("git", ["commit", "-m", "Configure creation checkout"]);
  return { f, h, path: here ? f.cwd : path, argv: ["start", "created", "--new", "--yes", ...(here ? ["--here"] : [])] };
}
async function createdOwner(h: ReturnType<typeof createLifecycleHarness>) {
  const lookup = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("created") }));
  const record = lifecycleSuccess(await h.store.read({ reference: lookup.reference }));
  expect(record).toMatchObject({ placement: { kind: "active" }, fields: { state: "Planning" } });
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the created owner's UID");
  return owner;
}

it.each([false, true])("creation stamps its committed owner on the marker, here=%s", async here => {
  const { f, h, path, argv } = await fixture(here);
  const result = await repairCli(f, argv, { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const owner = await createdOwner(h);
  expect(await readWorktreeMarker(path)).toMatchObject({ kind: "present",
    marker: { spawnedByArc: !here, createdFor: { kind: "work-unit", name: owner.name, uid: owner.uid } } });
}, 30_000);

function interruptedCreationStore(h: ReturnType<typeof createLifecycleHarness>, path: string, afterCommit: boolean) {
  let concurrent: Buffer | undefined;
  const batch = async (input: Parameters<typeof h.store.batch>[0]) => {
    const result = afterCommit ? await h.store.batch(input) : undefined;
    if (result !== undefined && result.status !== "ok") return result;
    const current = await readWorktreeMarker(path);
    if (current.kind !== "present") throw new Error("Expected the initial creation marker");
    await writeWorktreeMarker(path, { ...current.marker, createdAt: "2000-01-01T00:00:00.000Z" });
    concurrent = await readFile(resolveWorktreeMarkerPath(path));
    if (result === undefined) throw new Error("Creation interrupted before its record batch commits");
    return result;
  };
  const store = new Proxy(h.store, { get(target, key) {
    if (key === "batch") return batch;
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { store, concurrent: () => concurrent };
}

it.each([false, true])("creation preserves a changed marker and the committed record, here=%s", async here => {
  const { f, h, path, argv } = await fixture(here), interrupted = interruptedCreationStore(h, path, true);
  const store = interrupted.store;
  const result = await repairCli(f, argv, { store });
  expect(result.exitCode, result.stdout + result.stderr).toBe(1);
  expect(result.stdout + result.stderr).toContain("arc materialize created --here");
  const owner = await createdOwner(h);
  expect(await readFile(resolveWorktreeMarkerPath(path))).toEqual(interrupted.concurrent());
  const current = await readWorktreeMarker(path);
  expect(current).toMatchObject({ kind: "present", marker: { createdFor: { kind: "work-unit", name: "created" } } });
  expect(current).not.toHaveProperty("marker.createdFor.uid");
  expect((await f.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(path);
  const before = lifecycleSuccess(await h.store.version());
  const recovered = await repairCli({ ...f, cwd: path }, ["materialize", "created", "--here"], { store: h.store });
  expect(recovered.exitCode ?? 0, recovered.stdout + recovered.stderr).toBe(0);
  expect(await readWorktreeMarker(path)).toMatchObject({ kind: "present", marker: { spawnedByArc: !here,
    createdAt: "2000-01-01T00:00:00.000Z", createdFor: { kind: "work-unit", name: "created", uid: owner.uid } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
}, 30_000);

it.each(["legacy", "before-batch", "after-batch", "before-batch-reused"] as const)(
  "refuses acting readers, warns in reports, and recovers %s unbound creation", async mode => {
    const { f, h, path, argv } = await fixture(true);
    const archived = mode.endsWith("reused") ? await h.seedMeta("created", { state: "Shipped", currentWorkflow: null },
      { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }) : undefined;
    if (mode === "legacy") {
      await h.seedMeta("created", { state: "Planning", owner: "test-user", currentWorkflow: "draft-design" });
      await ensureWorktreeMarkerIgnored(path, f.exec, nodeWorktreeMarkerIgnoreFs);
      await writeWorktreeMarker(path, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "created" },
        spawningIdentity: "test-user", createdAt: "2026-01-01T00:00:00Z" });
    } else {
      const interrupted = interruptedCreationStore(h, path, mode === "after-batch");
      const created = await repairCli(f, argv, { store: interrupted.store });
      expect(created.exitCode, created.stdout + created.stderr).toBe(1);
      expect(await readFile(resolveWorktreeMarkerPath(path))).toEqual(interrupted.concurrent());
    }
    const origin = join(f.cwd, ".git", "recovery-origin.git");
    await f.exec("git", ["init", "--bare", origin]);
    await f.exec("git", ["remote", "add", "origin", origin]);
    await f.exec("git", ["push", "origin", "main"]);
    const before = lifecycleSuccess(await h.store.version()), marker = await readFile(resolveWorktreeMarkerPath(path));
    const head = (await f.exec("git", ["rev-parse", "HEAD"])).stdout;
    const commands: { argv: string[]; stdin?: string; code?: number }[] = [
      { argv: ["set-stage", "create-spec"] }, { argv: ["task", "close", "1.1"] },
      { argv: ["handoff", "write", "-"], stdin: JSON.stringify({ schemaVersion: 1, sessionContext: "Keep context", nextAction: "Continue planning", sessionType: "planning" }) },
      { argv: ["wu", "reconcile"] }, { argv: ["set-class", "Light"] },
      { argv: ["release", "commit", "-m", "fix: inspect recovery"], code: 10 }, { argv: ["release", "push"], code: 10 },
    ];
    for (const command of commands) {
      const result = await repairCli(f, command.argv, { store: h.store, stdin: command.stdin });
      expect(result.exitCode, command.argv.join(" ") + result.stdout + result.stderr).toBe(command.code ?? 1);
      expect(result.stdout + result.stderr).toContain("unbound");
      expect(result.stdout + result.stderr).toContain("arc locus release");
    }
    for (const report of [["active", "status", "--json"], ["user", "reconcile-references"]]) {
      const result = await repairCli(f, report, { store: h.store });
      expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
      expect(result.stdout + result.stderr).toContain("unbound");
      expect(result.stdout + result.stderr).toContain("arc locus release");
    }
    expect(lifecycleSuccess(await h.store.version())).toBe(before);
    expect(await readFile(resolveWorktreeMarkerPath(path))).toEqual(marker);
    const releaseFirst = mode === "before-batch-reused";
    if (releaseFirst) expect((await repairCli(f, ["locus", "release", "--json"], { store: h.store })).exitCode ?? 0).toBe(0);
    const recover = mode.startsWith("before") ? argv : ["materialize", "created", "--here"];
    const recovered = await repairCli(f, recover, { store: h.store });
    expect(recovered.exitCode ?? 0, recovered.stdout + recovered.stderr).toBe(0);
    expect((await repairCli(f, ["set-class", "Light"], { store: h.store })).exitCode ?? 0).toBe(0);
    expect((await repairCli(f, ["set-stage", "create-spec"], { store: h.store })).exitCode ?? 0).toBe(0);
    const owner = await createdOwner(h);
    expect(await readWorktreeMarker(path)).toMatchObject({ kind: "present", marker: { createdFor: { name: "created", uid: owner.uid } } });
    expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
    if (archived !== undefined) expect(lifecycleSuccess(await h.store.read({ reference: archived.reference }))).toEqual(archived);
  }, 30_000);
