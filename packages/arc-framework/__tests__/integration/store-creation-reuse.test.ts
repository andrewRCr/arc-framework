/** Every registered creation path reuses completed generations under production write checks. */
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { transientContent } from "../helpers/store/in-repo-substrates.js";
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { completeCutMapFixture } from "../fixtures/decompose-v4.js";
import { CutMapStarterSchema } from "../../src/lib/decompose/cut-map-schema.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import type { StoreRecord } from "../../src/lib/store/read.js";
import { readWorktreeMarker, writeWorktreeMarker, ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs } from "../../src/lib/git/worktree-marker.js";
const name = "member-a", completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
const modes = ["stub", "spawn", "here", "derived", "decompose", "promote"] as const;
type Mode = typeof modes[number];
async function fixture(mode: Mode) {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: randomUUID() })), "{}");
  const config = join(f.cwd, ".arc/system/arc-config.yml");
  await writeFile(config, (await readFile(config, "utf8")).replace(/^worktree.location_template:.*$/mu, "worktree.location_template: .arc-checkouts/{name}"));
  await f.exec("git", ["add", ".arc/system/arc-config.yml"]); await f.exec("git", ["commit", "-m", "Configure checkouts"]);
  await writeFile(join(f.cwd, ".git/info/exclude"), ".arc-checkouts/\ncut-map.json\n", { flag: "a" });
  if (mode === "derived") await f.exec("git", ["switch", "-c", `feat/${name}`]);
  if (mode === "decompose") {
    const origin = await h.seedMeta("origin", { state: "Planning", currentWorkflow: null, design: ["draft-origin.md"] }, { kind: "backlog", commitment: "planned" });
    await h.seed(recordReferences["work-item/draft"](origin.reference.owner), "# Origin\n\n## Scope\n\nOwned work.\n");
  }
  if (mode === "promote") expect(await repairCli(f, ["errand", "open", "source", "--intent", "Keep useful work", "--json"], { store: h.store }))
    .toMatchObject({ result: { outcome: "applied" } });
  return { ...f, ...h };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function action(h: Fixture, mode: Mode) {
  let argv: string[];
  if (mode === "decompose") {
    const result = await repairCli(h, ["decompose", "origin", "--preflight"], { store: h.store });
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    const starter = CutMapStarterSchema.parse(result.result), path = join(h.cwd, "cut-map.json");
    await writeFile(path, JSON.stringify(completeCutMapFixture(starter.machine)));
    argv = ["decompose", "origin", "--execute", path];
  } else if (mode === "stub") argv = ["stub", name, "--commitment", "planned", "--priority", "P1", "--class", "Light"];
  else if (mode === "promote") argv = ["errand", "promote", "source", "--name", name, "--floor", "derivation", "--class", "Light", "--json"];
  else argv = ["start", ...(mode === "derived" ? [] : [name]), "--new", ...(mode === "spawn" ? [] : ["--here"])];
  return repairCli(h, argv, { store: h.store });
}
async function archive(h: Fixture, generations = 1, errand = false) {
  const records: StoreRecord[] = [];
  if (errand) {
    const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name, uid: randomUUID() }));
    records.push(await h.seed(reference, transientContent(reference), completed));
  }
  for (let n = 0; n < generations; n++) records.push(await h.seedMeta(name, { state: "Shipped", currentWorkflow: null }, completed));
  const oldest = records.find(record => record.reference.kind === "work-item/meta");
  if (oldest === undefined) throw new Error("Missing archived work unit");
  const path = join(h.cwd, ".arc-checkouts", "archived");
  await h.exec("git", ["worktree", "add", "--detach", path, "main"]);
  await ensureWorktreeMarkerIgnored(path, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(path, { spawnedByArc: false, createdFor: boundWorkUnitSubject(oldest), spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  return { records, path, marker: await readWorktreeMarker(path) };
}
async function assertArchive(h: Fixture, archived: Awaited<ReturnType<typeof archive>>) {
  for (const record of archived.records) expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
  expect(await readWorktreeMarker(archived.path)).toEqual(archived.marker);
}
const reusable = modes.flatMap(mode => (["completed", "third-generation", "with-errand"] as const).map(kind => ({ mode, kind })));
it.each(reusable)("$mode reuses $kind beside the archived bound checkout", async ({ mode, kind }) => {
  const h = await fixture(mode), archived = await archive(h, kind === "third-generation" ? 2 : 1, kind === "with-errand");
  const result = await action(h, mode);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const selected = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse(name) }));
  const record = lifecycleSuccess(await h.store.read({ reference: selected.reference }));
  expect(record).toMatchObject({ reference: { kind: "work-item/meta" }, fields: { state: "Planning" } });
  for (const old of archived.records) expect(record.reference.owner).not.toEqual(old.reference.owner);
  await assertArchive(h, archived);
}, 30_000);
const heldKinds = ["live-work-unit", "live-cohort", "completed-errand", "completed-cohort", "completed-former"] as const;
async function seedHolder(h: Fixture, kind: typeof heldKinds[number]) {
  if (kind === "live-cohort" || kind === "completed-cohort") return h.seed(
    recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })), `# Cohort: ${name}\n\n**Purpose:** Coordinate work.\n`,
    kind === "completed-cohort" ? completed : undefined);
  if (kind === "completed-errand") {
    const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name }));
    return h.seed(reference, transientContent(reference), completed);
  }
  const record = await h.seedMeta(name, kind === "completed-former" ? { state: "Shipped", currentWorkflow: null } : { state: "Planning", currentWorkflow: "draft-design" },
    kind === "completed-former" ? completed : { kind: "active" });
  if (kind !== "completed-former") return record;
  lifecycleSuccess(await h.store.write({ ...recordPut(record), action: "put", content: record.content.replaceAll(name, "current-holder"),
    reference: { ...record.reference, owner: { ...record.reference.owner, name: SlugSchema.parse("current-holder") } }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  return lifecycleSuccess(await h.store.read({ reference: record.reference }));
}
it.each(modes.flatMap(mode => heldKinds.map(kind => ({ mode, kind }))))("$mode refuses $kind with its creation remedy", async ({ mode, kind }) => {
  const h = await fixture(mode), holder = await seedHolder(h, kind), before = lifecycleSuccess(await h.store.version());
  const marker = await readWorktreeMarker(h.cwd), head = (await h.exec("git", ["rev-parse", "HEAD"])).stdout;
  const result = await action(h, mode), text = result.stdout + result.stderr;
  expect(result.exitCode).toBe(1);
  expect(text).toMatch(/choose another name/iu);
  expect(text).not.toMatch(/rename/iu);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: holder.reference }))).toEqual(holder);
  expect(await readWorktreeMarker(h.cwd)).toEqual(marker);
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
}, 30_000);
it.each(modes.flatMap(mode => (["stub", "in-flight"] as const).map(dependent => ({ mode, dependent }))))("$mode respects the $dependent dependent's edge on reuse", async ({ mode, dependent }) => {
  const h = await fixture(mode), archived = await archive(h);
  const edge = await h.seedMeta("dependent", { state: dependent === "stub" ? "Planning" : "Active", currentWorkflow: dependent === "stub" ? null : "process-task-loop", dependsOn: [name] },
    dependent === "stub" ? { kind: "backlog", commitment: "planned" } : { kind: "active" });
  const before = lifecycleSuccess(await h.store.version()), marker = await readWorktreeMarker(h.cwd);
  const result = await action(h, mode);
  if (dependent === "stub") {
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(lifecycleSuccess(await h.store.read({ reference: edge.reference })).fields).toMatchObject({ dependsOn: [] });
  } else {
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("arc wu reconcile --apply");
    expect(lifecycleSuccess(await h.store.version())).toBe(before);
    expect(lifecycleSuccess(await h.store.read({ reference: edge.reference }))).toEqual(edge);
    expect(await readWorktreeMarker(h.cwd)).toEqual(marker);
  }
  await assertArchive(h, archived);
}, 30_000);
it.each(["work-unit", "errand"] as const)("refuses a completed %s name for a new cohort", async kind => {
  const h = await fixture("decompose");
  if (kind === "work-unit") await h.seedMeta("group", { state: "Shipped", currentWorkflow: null }, completed);
  else {
    const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "group" }));
    await h.seed(reference, transientContent(reference), completed);
  }
  const before = lifecycleSuccess(await h.store.version()), result = await action(h, "decompose");
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("authoring.placement.cohort");
  expect(result.stdout + result.stderr).toMatch(/choose another name/iu);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
}, 30_000);
