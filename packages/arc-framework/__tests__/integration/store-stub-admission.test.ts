/** Registered stub creation admits completed generations and preserves admission/write refusals. */
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { transientContent } from "../helpers/store/in-repo-substrates.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { readWorktreeMarker, writeWorktreeMarker, ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs } from "../../src/lib/git/worktree-marker.js";
import type { StoreRecord } from "../../src/lib/store/read.js";
const completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
const argv = ["stub", "demo", "--commitment", "planned", "--priority", "P1", "--class", "Light"];
async function fixture() { return { ...await repairCliFixture(), ...createLifecycleHarness() }; }

it("creates a new backlog generation beside the completed owner's lingering bound checkout", async () => {
  const h = await fixture(), archived = await h.seedMeta("demo", { state: "Shipped", currentWorkflow: null }, completed);
  await writeFile(join(h.cwd, ".git/info/exclude"), ".arc-checkouts/\n", { flag: "a" });
  const oldPath = join(h.cwd, ".arc-checkouts", "archived");
  await h.exec("git", ["worktree", "add", "--detach", oldPath, "main"]);
  await ensureWorktreeMarkerIgnored(oldPath, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(oldPath, { spawnedByArc: false, createdFor: boundWorkUnitSubject(archived),
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  const marker = await readWorktreeMarker(oldPath);
  const result = await repairCli(h, argv, { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const selected = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("demo") }));
  expect(selected.reference.owner).not.toEqual(archived.reference.owner);
  const stub = lifecycleSuccess(await h.store.read({ reference: selected.reference }));
  expect(stub).toMatchObject({ placement: { kind: "backlog", commitment: "planned" }, fields: { state: "Planning" } });
  expect(lifecycleSuccess(await h.store.read({ reference: archived.reference }))).toEqual(archived);
  expect(await readWorktreeMarker(oldPath)).toEqual(marker);
}, 30_000);

it.each(["live-unit", "live-cohort", "completed-errand", "completed-former"] as const)("refuses %s with creation's remedy before a write", async kind => {
  const h = await fixture();
  let record: StoreRecord;
  if (kind === "live-cohort") record = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "demo" })),
    "# Cohort: demo\n\n**Purpose:** Coordinate work.\n");
  else if (kind === "completed-errand") {
    const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "demo" }));
    record = await h.seed(reference, transientContent(reference), completed);
  } else record = await h.seedMeta("demo", kind === "completed-former" ? { state: "Shipped", currentWorkflow: null } : {},
    kind === "completed-former" ? completed : { kind: "active" });
  if (kind === "completed-former") {
    lifecycleSuccess(await h.store.write({ ...recordPut(record), action: "put", content: record.content.replaceAll("demo", "current"),
      reference: { ...record.reference, owner: { ...record.reference.owner, name: SlugSchema.parse("current") } }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
    record = lifecycleSuccess(await h.store.read({ reference: record.reference }));
  }
  const before = lifecycleSuccess(await h.store.version()), result = await repairCli(h, argv, { store: h.store });
  expect(result.exitCode).toBe(1);
  const text = result.stdout + result.stderr;
  expect(text).toMatch(/choose another name/iu);
  expect(text).toContain(record.reference.owner.name);
  if (record.reference.owner.type === "person" || record.reference.owner.uid === undefined) throw new Error("Expected holder UUID");
  expect(text).toContain(record.reference.owner.uid);
  expect(/wait/iu.test(text)).toBe(kind.startsWith("live"));
  expect(text).not.toMatch(/rename/iu);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
}, 30_000);

it("prints the in-flight dependent edge's write-rule remedy", async () => {
  const h = await fixture(), archived = await h.seedMeta("demo", { state: "Shipped", currentWorkflow: null }, completed);
  const dependent = await h.seedMeta("dependent", { dependsOn: ["demo"] });
  const before = lifecycleSuccess(await h.store.version()), result = await repairCli(h, argv, { store: h.store });
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("Depends On edges in `dependent`");
  expect(result.stdout + result.stderr).toContain("arc wu reconcile --apply");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: archived.reference }))).toEqual(archived);
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toEqual(dependent);
}, 30_000);

it("settles a stub's completed dependency in the batch creating the reused name", async () => {
  const h = await fixture(), archived = await h.seedMeta("demo", { state: "Shipped", currentWorkflow: null }, completed);
  const dependent = await h.seedMeta("waiting", { state: "Planning", currentWorkflow: null, dependsOn: ["demo"] },
    { kind: "backlog", commitment: "planned" });
  const result = await repairCli(h, argv, { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const created = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("demo") }));
  expect(created.reference.owner).not.toEqual(archived.reference.owner);
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toMatchObject({ fields: { dependsOn: [] } });
  expect(lifecycleSuccess(await h.store.read({ reference: archived.reference }))).toEqual(archived);
}, 30_000);
