/** Recompute observes the admitted repository after the native import without changing it. */
import { mkdir, readFile, writeFile, rm, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveGitCommonDir } from "../../src/lib/git/exec.js";
import { expect, it } from "vitest";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { importWindowFixture } from "../helpers/cutover-window/import.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { saveImportPersonal } from "../helpers/store/import-fixture.js";
import { windowClaims } from "../helpers/cutover-window/identity-inputs.js";
import { seedTransients, transientSourceRef, ordinaryErrand } from "../helpers/store/import-transients.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";

async function importedFixture() {
  const h = await windowFixture();
  await importWindowFixture(h);
  return h;
}

async function runFixtureWindow(h: Awaited<ReturnType<typeof windowFixture>>, operation = "recompute", extra: string[] = []) {
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow([operation, "--repo", h.root, "--json", ...(operation === "restore"
    ? ["--flip-branch", h.flip.branch, "--flip-pr", String(h.flip.pullRequest), "--pull-requests", h.listingPath] : []), ...extra], undefined, {
    stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); },
  });
  return { exit, result: stdout.length ? JSON.parse(stdout.join("")) as unknown : null, report: stderr.join("") };
}

it("passes unchanged imported inputs and leaves every ref unchanged", async () => {
  const h = await importedFixture();
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const result = await runFixtureWindow(h);
  expect(result, result.report).toMatchObject({ exit: 0, result: { operation: "recompute", status: "passed", findings: [] } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
}, 60_000);

it.each(["worktree set", "HEAD", "personal digest", "review gate digest"] as const)(
  "stops on a changed %s and passes after repair", async field => {
    const h = await importedFixture();
    let repair: () => Promise<unknown>;
    if (field === "worktree set") {
      const child = join(h.root, ".arc-fixture/new-checkout");
      await h.git("git", ["worktree", "add", "--detach", child]);
      repair = () => h.git("git", ["worktree", "remove", child]);
    } else if (field === "HEAD") {
      const before = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
      await h.git("git", ["commit", "--allow-empty", "-m", "Change after import"]);
      repair = () => h.git("git", ["reset", "--hard", before]);
    } else if (field === "personal digest") {
      const file = join(h.root, ".arc/user/andrew/WORKING-MEMORY.md");
      const before = await readFile(file);
      await writeFile(file, "# Working Memory\n\nA new note after the import.\n");
      repair = () => writeFile(file, before);
    } else {
      const directory = join(await resolveGitCommonDir(h.git, h.root), "arc/review-gate/materializations");
      await mkdir(directory, { recursive: true });
      const file = join(directory, "late.bin");
      await writeFile(file, Buffer.from([0, 255, 1]));
      repair = () => rm(file);
    }
    const refused = await runFixtureWindow(h);
    expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringContaining(field), remedy: expect.stringContaining("restore") }),
    ]) } });
    expect(refused.report).toContain("recorded"); expect(refused.report).toContain("observed");
    await repair();
    const repaired = await runFixtureWindow(h);
    expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
  }, 60_000,
);

it.each(["dirty", "ignored", "stash"] as const)("stops on %s input left after import and passes after repair", async mode => {
  const h = await importedFixture();
  let file: string, repair: () => Promise<unknown>;
  if (mode === "stash") {
    file = ".arc/active/tasks-alpha.md";
    await appendFile(join(h.root, file), "\nA late task change.\n");
    await h.git("git", ["stash", "push", "-m", "Late tracked state", "--", file]);
    repair = () => h.git("git", ["stash", "drop"]);
  } else {
    file = mode === "ignored" ? ".arc/active/temp-alpha.md" : "unfinished.txt";
    if (mode === "ignored") {
      const exclude = (await h.git("git", ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"])).stdout.trim();
      await appendFile(exclude, `${file}\n`);
    }
    await writeFile(join(h.root, file), "A late input.\n");
    repair = () => rm(join(h.root, file));
  }
  const refused = await runFixtureWindow(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining(mode), remedy: expect.stringContaining("restore") }),
  ]) } });
  expect(refused.report).toContain(file); expect(refused.report).toContain("recorded"); expect(refused.report).toContain("observed");
  await repair();
  const repaired = await runFixtureWindow(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("observes a host main move without fetching it and passes when the host is repaired", async () => {
  const h = await importedFixture();
  const before = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const tree = (await h.git("git", ["rev-parse", "HEAD^{tree}"])).stdout.trim();
  const next = (await h.git("git", ["commit-tree", tree, "-p", before, "-m", "Host-only movement"])).stdout.trim();
  await h.remote("git", ["fetch", h.root, `${next}:refs/heads/main`]);
  const refused = await runFixtureWindow(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: "host:main", condition: expect.stringContaining(next) }),
  ]) } });
  expect(refused.report).toContain(before);
  expect((await h.git("git", ["rev-parse", "origin/main"])).stdout.trim()).toBe(before);
  await h.remote("git", ["update-ref", "refs/heads/main", before, next]);
  const repaired = await runFixtureWindow(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("compares the landed claims and Errand records with held identity inputs and resumes through restore", async () => {
  const h = await windowFixture();
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const claims = windowClaims(head);
  const held = await seedTransients(h, claims);
  const checked = await checkFixture(h);
  expect(checked, checked.report).toMatchObject({ exit: 0 });
  const changed = claims.map(record => record.kind === "groom" ? { ...record, members: ["alpha", "beta"] } : record);
  await h.git("git", ["update-ref", "-d", transientSourceRef, held]);
  await seedTransients(h, [...changed, ordinaryErrand]);
  await saveImportPersonal(h.root, false);
  expect(await invokeStoreRemote(["origin", "push"], { cwd: h.root })).toMatchObject({ result: { status: "ok" } });
  const migrated = await h.migrate();
  expect(migrated, JSON.stringify(migrated)).toMatchObject({ status: "ok" });
  const refused = await runFixtureWindow(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: transientSourceRef, condition: expect.stringContaining("claims/groom") }),
    expect.objectContaining({ subject: transientSourceRef, condition: expect.stringContaining("work-item/record") }),
  ]) } });
  expect(refused.report).toContain("beta"); expect(refused.report).toContain("consumed record");
  const restored = await runFixtureWindow(h, "restore", ["--accept", `${transientSourceRef}=absent`]);
  expect(restored, restored.report).toMatchObject({ exit: 0 });
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await saveImportPersonal(h.root, false);
  expect(await invokeStoreRemote(["origin", "push"], { cwd: h.root })).toMatchObject({ result: { status: "ok" } });
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const repaired = await runFixtureWindow(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it.each(["local", "origin"] as const)("refuses an identity ref remaining on %s and passes after retirement", async side => {
  const h = await importedFixture();
  const tip = await seedTransients(h, []);
  if (side === "origin") {
    await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
    await h.git("git", ["update-ref", "-d", transientSourceRef, tip]);
  }
  const refused = await runFixtureWindow(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: `${side}:${transientSourceRef}`, condition: expect.stringContaining(tip),
      remedy: expect.stringContaining("restore") }),
  ]) } });
  expect(refused.report).toContain("retired");
  if (side === "local") await h.git("git", ["update-ref", "-d", transientSourceRef, tip]);
  else await h.remote("git", ["update-ref", "-d", transientSourceRef, tip]);
  const repaired = await runFixtureWindow(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);
