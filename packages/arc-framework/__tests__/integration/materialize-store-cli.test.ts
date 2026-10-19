/** Registered materialize repairs a corrupt marker, then claims branchless work without moving code. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { success } from "../helpers/store/suite-tools.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, readWorktreeMarker, resolveWorktreeMarkerPath,
  writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { createProjectIdentityReader } from "../../src/lib/store/project-identity.js";

it("refuses a corrupt current marker, then materializes after its repair while preserving Store records and local code", async () => {
  const f = await repairCliFixture();
  const primary = await f.h.workUnit("materialize", "test-user", "active", "", "Planning");
  await f.exec("git", ["switch", "-c", "personal-work"]);
  await f.exec("git", ["commit", "--allow-empty", "-m", "Personal work ahead of base"]);
  const head = (await f.exec("git", ["rev-parse", "HEAD"])).stdout;
  const dirty = join(f.cwd, "personal-edit");
  await writeFile(dirty, "Keep this personal edit\n");
  await ensureWorktreeMarkerIgnored(f.cwd, f.exec, nodeWorktreeMarkerIgnoreFs);
  const markerPath = resolveWorktreeMarkerPath(f.cwd), corrupt = "{not valid marker JSON\n";
  await mkdir(dirname(markerPath), { recursive: true });
  await writeFile(markerPath, corrupt);
  const version = success(await f.h.context.store.version());
  const argv = ["materialize", primary.reference.owner.name, "--here"];
  const refused = await repairCli(f, argv);
  expect(refused, refused.stdout + refused.stderr).toMatchObject({ exitCode: 1 });
  expect(refused.stdout + refused.stderr).toMatch(/marker/iu);
  expect(await readFile(markerPath, "utf8")).toBe(corrupt);
  expect(success(await f.h.context.store.version())).toBe(version);
  expect(success(await f.h.context.store.read({ reference: primary.reference }))).toEqual(primary);
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);

  // The person removes the corrupt machine-local observation, then retries the same command.
  await rm(markerPath);
  const materialized = await repairCli(f, argv);
  expect(materialized, materialized.stdout + materialized.stderr).toMatchObject({ exitCode: undefined });
  expect(materialized.stdout + materialized.stderr).toMatch(/Materialized/iu);
  expect(await readWorktreeMarker(f.cwd)).toMatchObject({ kind: "present", marker: {
    spawnedByArc: false, spawningIdentity: "test-user",
    createdFor: { kind: "work-unit", name: primary.reference.owner.name },
  } });
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
  expect((await f.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout).toBe("personal-work");
  expect(await readFile(dirty, "utf8")).toBe("Keep this personal edit\n");
  expect(success(await f.h.context.store.version())).toBe(version);
  expect(success(await f.h.context.store.read({ reference: primary.reference }))).toEqual(primary);
}, 30_000);

it("refuses linked in-place materialization before fetching into an occupied checkout and succeeds after release", async () => {
  const f = await repairCliFixture();
  const store = f.h.context.store;
  const primary = await f.h.workUnit("materialize-linked", "test-user", "active", "", "Planning");
  const occupant = await f.h.workUnit("existing-occupant", "test-user", "active", "", "Planning");
  const branch = "feat/materialize-linked", repository = await createProjectIdentityReader(store)();
  success(await store.write({ ...recordPut(primary, { links: { branches: [{ repository, ref: branch, linkedAs: "created", excluded: [] }] } }),
    provenance: { verb: "fixture", lifecycleAction: "link" } }));
  const linked = success(await store.read({ reference: primary.reference }));
  await f.exec("git", ["init", "--bare", join(f.cwd, ".git/materialize-origin.git")]);
  await f.exec("git", ["remote", "add", "origin", join(f.cwd, ".git/materialize-origin.git")]);
  await f.exec("git", ["push", "origin", "main", `main:refs/heads/${branch}`]);
  for (const ref of ["refs/remotes/origin/main", `refs/remotes/origin/${branch}`]) await f.exec("git", ["update-ref", "-d", ref]);
  await ensureWorktreeMarkerIgnored(f.cwd, f.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(f.cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: occupant.reference.owner.name },
    spawningIdentity: "test-user", createdAt: new Date(0).toISOString() });
  const marker = await readWorktreeMarker(f.cwd), version = success(await store.version());
  expect(marker).toMatchObject({ kind: "present" });
  const refs = (await f.exec("git", ["for-each-ref", "--format=%(refname):%(objectname)"])).stdout;
  const argv = ["materialize", primary.reference.owner.name, "--here"];
  const rejected = await repairCli(f, argv);
  expect(rejected, rejected.stdout + rejected.stderr).toMatchObject({ exitCode: 1 });
  expect(rejected.stdout + rejected.stderr).toMatch(/occup|hold|locus/iu);
  expect((await f.exec("git", ["for-each-ref", "--format=%(refname):%(objectname)"])).stdout).toBe(refs);
  expect(await readWorktreeMarker(f.cwd)).toEqual(marker);
  expect(success(await store.version())).toBe(version);
  expect(success(await store.read({ reference: primary.reference }))).toEqual(linked);
  expect(success(await store.read({ reference: occupant.reference }))).toEqual(occupant);
  expect((await repairCli(f, ["locus", "release", occupant.reference.owner.name, "--json"])).result).toMatchObject({ status: "refused" });
  // Pause the owned occupant, then release its anchored marker through the registered commands.
  expect((await repairCli(f, ["pause", occupant.reference.owner.name, "--reason", "Materialize elsewhere"])).exitCode).toBeUndefined();
  expect((await repairCli(f, ["locus", "release", occupant.reference.owner.name, "--json"])).result).toMatchObject({ status: "released" });
  const repaired = await repairCli(f, argv);
  expect(repaired, repaired.stdout + repaired.stderr).toMatchObject({ exitCode: undefined });
  expect((await f.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe(branch);
  expect(success(await store.read({ reference: primary.reference }))).toEqual(linked);
}, 30_000);
