/** Native candidate branches and staging residue cannot cross the cutover boundary. */
import { expect, it } from "vitest";
import { checkFixture, mergeMainIntoFixtureFlip } from "../helpers/cutover-window/check.js";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

it("refuses unlanded local and fetched candidates and passes once main contains their tips", async () => {
  const h = await windowFixture();
  const branch = "chore/decompose-alpha";
  await h.git("git", ["checkout", "-b", branch]);
  await h.git("git", ["commit", "--allow-empty", "-m", "Stage a decomposition cut"]);
  await h.git("git", ["push", "--set-upstream", "origin", branch]);
  await h.git("git", ["checkout", "main"]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: `refs/heads/${branch}`, condition: expect.stringContaining("not contained") }),
    expect.objectContaining({ subject: `refs/remotes/origin/${branch}`, remedy: expect.stringMatching(/land.*delete/iu) }),
  ]) } });
  await h.git("git", ["merge", "--no-ff", branch, "-m", "Land the staged cut"]);
  await h.git("git", ["push", "origin", "main"]);
  await mergeMainIntoFixtureFlip(h);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("refuses any decomposition staging entry and passes once that entry is removed", async () => {
  const h = await windowFixture();
  const common = resolve(h.root, (await h.git("git", ["rev-parse", "--git-common-dir"])).stdout.trim());
  const directory = join(common, "arc/decompose-worktrees"), entry = join(directory, "unfinished");
  await mkdir(directory, { recursive: true });
  await writeFile(entry, "Held decomposition state\n");
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: entry, condition: expect.stringContaining("decomposition"),
      remedy: expect.stringMatching(/land.*delete/iu) }),
  ]) } });
  await rm(entry);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("reports an unreadable staging inventory and passes after its directory is repaired", async () => {
  const h = await windowFixture();
  const common = resolve(h.root, (await h.git("git", ["rev-parse", "--git-common-dir"])).stdout.trim());
  const directory = join(common, "arc/decompose-worktrees");
  await mkdir(join(common, "arc"), { recursive: true });
  await writeFile(directory, "Not a directory\n");
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: directory, condition: expect.stringContaining("inventory"), remedy: expect.stringContaining("retry") }),
  ]) } });
  await rm(directory);
  await mkdir(directory);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);
