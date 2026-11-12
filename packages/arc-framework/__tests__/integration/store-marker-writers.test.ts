/** Registered placement and rename preserve the work-unit owner's marker binding. */
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { readWorktreeMarker, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

async function fixture(verb: "start" | "materialize") {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: randomUUID() })), "{}");
  const primary = await h.seedMeta("example", { state: "Planning", currentWorkflow: "draft-design" },
    verb === "start" ? { kind: "backlog", commitment: "planned" } : { kind: "active" });
  if (primary.reference.owner.type !== "work-item" || primary.reference.owner.uid === undefined) throw new Error("Expected a minted owner UID");
  const path = join(f.cwd, ".arc-checkouts", "example"), configPath = join(f.cwd, ".arc/system/arc-config.yml");
  const config = await readFile(configPath, "utf8");
  await writeFile(configPath, config.replace(/^worktree.location_template:.*$/mu, `worktree.location_template: ${path}`));
  await f.exec("git", ["add", ".arc/system/arc-config.yml"]);
  await f.exec("git", ["commit", "-m", "Configure checkout placement"]);
  return { f, h, path, uid: primary.reference.owner.uid };
}

it.each(["start", "materialize"] as const)("%s binds the selected owner in a spawned checkout", async verb => {
  const { f, h, path, uid } = await fixture(verb);
  const result = await repairCli(f, [verb, "example"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(await readWorktreeMarker(path)).toMatchObject({ kind: "present",
    marker: { spawnedByArc: true, createdFor: { kind: "work-unit", name: "example", uid } } });
}, 30_000);

it.each(["start", "materialize"] as const)("%s binds the selected owner in the entering checkout", async verb => {
  const { f, h, uid } = await fixture(verb);
  const result = await repairCli(f, [verb, "example", "--here"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(await readWorktreeMarker(f.cwd)).toMatchObject({ kind: "present",
    marker: { spawnedByArc: false, createdFor: { kind: "work-unit", name: "example", uid } } });
}, 30_000);

it("rename keeps the materialized owner's UID under its new name", async () => {
  const { f, h, uid } = await fixture("materialize");
  expect((await repairCli(f, ["materialize", "example", "--here"], { store: h.store })).exitCode ?? 0).toBe(0);
  const current = await readWorktreeMarker(f.cwd);
  if (current.kind !== "present" || current.marker.provisioning !== undefined) throw new Error("Expected the materialized work-unit marker");
  await writeWorktreeMarker(f.cwd, { ...current.marker, createdFor: { kind: "work-unit", name: "example", uid } });
  const renamed = await repairCli(f, ["rename", "example", "renamed"], { store: h.store });
  expect(renamed.exitCode ?? 0, renamed.stdout + renamed.stderr).toBe(0);
  expect(await readWorktreeMarker(f.cwd)).toMatchObject({ kind: "present",
    marker: { createdFor: { kind: "work-unit", name: "renamed", uid } } });
}, 30_000);
