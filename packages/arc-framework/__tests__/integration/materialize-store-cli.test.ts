/** Registered materialize repairs a corrupt marker, then claims branchless work without moving code. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { success } from "../helpers/store/suite-tools.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, readWorktreeMarker, resolveWorktreeMarkerPath } from "../../src/lib/git/worktree-marker.js";

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
