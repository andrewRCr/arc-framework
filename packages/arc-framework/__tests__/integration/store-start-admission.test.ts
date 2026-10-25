/** Registered start creation preserves raw name admission across spawned and anchored paths. */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { recordPut, batchLifecycleWrites } from "../../src/lib/store/lifecycle-write.js";
import type { StoreRecord } from "../../src/lib/store/read.js";
import { transientContent } from "../helpers/store/in-repo-substrates.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { readWorktreeMarker, writeWorktreeMarker, ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs } from "../../src/lib/git/worktree-marker.js";
const completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
async function fixture() {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: randomUUID() })), "{}");
  const configPath = join(f.cwd, ".arc/system/arc-config.yml");
  await writeFile(configPath, (await readFile(configPath, "utf8")).replace(/^worktree.location_template:.*$/mu,
    "worktree.location_template: .arc-checkouts/{name}"));
  await f.exec("git", ["add", ".arc/system/arc-config.yml"]);
  await f.exec("git", ["commit", "-m", "Configure start checkouts"]);
  await writeFile(join(f.cwd, ".git/info/exclude"), ".arc-checkouts/\n", { flag: "a" });
  return { ...f, ...h };
}
it.each(["spawn", "here", "derived"] as const)("creates through %s on a completed name beside its archived bound holder", async mode => {
  const h = await fixture(), archived = await h.seedMeta("example", { state: "Shipped", currentWorkflow: null }, completed);
  const oldPath = join(h.cwd, ".arc-checkouts", "archived");
  await h.exec("git", ["worktree", "add", "--detach", oldPath, "main"]);
  await ensureWorktreeMarkerIgnored(oldPath, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(oldPath, { spawnedByArc: false, createdFor: boundWorkUnitSubject(archived), spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  const marker = await readWorktreeMarker(oldPath);
  if (mode === "derived") await h.exec("git", ["switch", "-c", "feat/example"]);
  const result = await repairCli(h, ["start", ...(mode === "derived" ? [] : ["example"]), "--new", ...(mode === "spawn" ? [] : ["--here"])], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const selected = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("example") }));
  const record = lifecycleSuccess(await h.store.read({ reference: selected.reference }));
  expect(record.reference.owner).not.toEqual(archived.reference.owner);
  expect(record).toMatchObject({ placement: { kind: "active" }, fields: { state: "Planning", owner: "test-user", branch: null } });
  const path = mode === "spawn" ? join(h.cwd, ".arc-checkouts", "example") : h.cwd;
  expect(await readWorktreeMarker(path)).toMatchObject({ kind: "present", marker: { createdFor: boundWorkUnitSubject(record) } });
  expect(await readWorktreeMarker(oldPath)).toEqual(marker);
  expect(lifecycleSuccess(await h.store.read({ reference: archived.reference }))).toEqual(archived);
}, 30_000);

type Fixture = Awaited<ReturnType<typeof fixture>>;
type HolderKind = "planning-unit" | "active-unit" | "live-cohort" | "completed-errand" | "completed-cohort" | "completed-former";
async function holder(h: Fixture, kind: HolderKind, name = "occupied"): Promise<StoreRecord> {
  if (kind === "completed-errand") {
    const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name }));
    return h.seed(reference, transientContent(reference), completed);
  }
  if (kind === "live-cohort" || kind === "completed-cohort") {
    const group = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })),
      `# Cohort: ${name}\n\n**Purpose:** Coordinate work.\n`);
    if (kind === "live-cohort") return group;
    const member = await h.seedMeta(`${name}-member`, { cohort: name });
    lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(group, { placement: completed }), recordPut(member, { placement: completed })],
      { verb: "archive", lifecycleAction: "archive" }));
    return lifecycleSuccess(await h.store.read({ reference: group.reference }));
  }
  const record = await h.seedMeta(name, { state: kind === "completed-former" ? "Shipped" : kind === "active-unit" ? "Active" : "Planning",
    currentWorkflow: kind === "completed-former" ? null : kind === "active-unit" ? "process-task-loop" : "draft-design" },
  kind === "completed-former" ? completed : { kind: "active" });
  if (kind !== "completed-former") return record;
  const changed = lifecycleSuccess(await h.store.write({ ...recordPut(record), action: "put", content: record.content.replaceAll(name, "current"),
    reference: { ...record.reference, owner: { ...record.reference.owner, name: SlugSchema.parse("current") } }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  return lifecycleSuccess(await h.store.read({ reference: changed.reference }));
}
const blocked: { mode: "named" | "derived"; kind: HolderKind }[] = [
  ...(["planning-unit", "active-unit", "live-cohort", "completed-errand", "completed-cohort", "completed-former"] as const).map(kind => ({ mode: "named" as const, kind })),
  ...(["planning-unit", "live-cohort", "completed-errand", "completed-cohort", "completed-former"] as const).map(kind => ({ mode: "derived" as const, kind })),
];
it.each(blocked)("$mode creation refuses $kind before record or marker writes", async ({ mode, kind }) => {
  const h = await fixture(), record = await holder(h, kind);
  if (mode === "derived") await h.exec("git", ["switch", "-c", "feat/occupied"]);
  const before = lifecycleSuccess(await h.store.version()), head = (await h.exec("git", ["rev-parse", "HEAD"])).stdout;
  const result = await repairCli(h, ["start", ...(mode === "named" ? ["occupied"] : []), "--new", "--here"], { store: h.store });
  expect(result.exitCode).toBe(1);
  const text = result.stdout + result.stderr;
  expect(text).toMatch(/choose another name/iu);
  expect(text).toContain(record.reference.owner.name);
  if (record.reference.owner.type === "person" || record.reference.owner.uid === undefined) throw new Error("Expected holder UUID");
  expect(text).toContain(record.reference.owner.uid);
  expect(text).not.toMatch(/rename/iu);
  if (mode === "named" && kind === "planning-unit") expect(text).toContain("occupied is already started");
  if (mode === "named" && kind === "active-unit") expect(text).toMatch(/omit.*--new/iu);
  if (mode === "derived") expect(text).toContain("arc start <name> --new --here");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
}, 30_000);

it.each(["named", "derived"] as const)("%s creation reports a live tie with no lifecycle pointer", async mode => {
  const h = await fixture(), unit = await holder(h, "planning-unit"), group = await holder(h, "live-cohort");
  if (mode === "derived") await h.exec("git", ["switch", "-c", "feat/occupied"]);
  const before = lifecycleSuccess(await h.store.version());
  const result = await repairCli(h, ["start", ...(mode === "named" ? ["occupied"] : []), "--new", "--here"], { store: h.store });
  expect(result.exitCode).toBe(1);
  const text = result.stdout + result.stderr;
  for (const record of [unit, group]) {
    const owner = record.reference.owner;
    if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected holder UUID");
    expect(text).toContain(owner.uid);
  }
  expect(text).toMatch(/choose another name/iu);
  expect(text).not.toMatch(/rename|already started|omit.*--new|arc materialize/iu);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
}, 30_000);

it("derived-name failure preserves the in-flight dependency write-rule remedy", async () => {
  const h = await fixture(), archived = await h.seedMeta("occupied", { state: "Shipped", currentWorkflow: null }, completed);
  const dependent = await h.seedMeta("dependent", { dependsOn: ["occupied"] });
  await h.exec("git", ["switch", "-c", "feat/occupied"]);
  const before = lifecycleSuccess(await h.store.version());
  const result = await repairCli(h, ["start", "--new", "--here"], { store: h.store });
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("Depends On edges in `dependent`");
  expect(result.stdout + result.stderr).toContain("arc wu reconcile --apply");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.read({ reference: archived.reference }))).toEqual(archived);
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toEqual(dependent);
}, 30_000);
