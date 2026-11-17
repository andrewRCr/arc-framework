/** The import is bound to the primary on main and fresh host branch observations. */
import { readWindowHold } from "../../src/scripts/cutover-window/hold.js";
import { join } from "node:path";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture, mergeMainIntoFixtureFlip } from "../helpers/cutover-window/check.js";

it("refuses an importing primary off main and passes after returning to main", async () => {
  const h = await windowFixture();
  await h.git("git", ["checkout", h.flip.branch]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining(h.root), condition: expect.stringContaining("primary on main") }),
  ]) } });
  await h.git("git", ["checkout", "main"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses a linked importing checkout and passes once the primary is used", async () => {
  const h = await windowFixture(), child = join(h.root, ".arc-fixture/importing-alpha");
  await h.git("git", ["worktree", "add", child, "feat/alpha"]); await h.git("git", ["worktree", "lock", child]);
  await writeWorktreeMarker(child, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "work-unit", name: "alpha" } });
  const refused = await checkFixture({ ...h, root: child });
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: [
    expect.objectContaining({ subject: expect.stringContaining("importing-alpha"), condition: expect.stringContaining("primary on main") }),
  ] } });
  await h.git("git", ["worktree", "unlock", child]); await h.git("git", ["worktree", "remove", child]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses a main host tip beyond its HEAD and passes after main is pulled", async () => {
  const h = await windowFixture(), head = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  const tree = (await h.git("git", ["rev-parse", "main^{tree}"])).stdout.trim();
  const next = (await h.ports.execInput(["commit-tree", tree, "-p", head], "Advance host main\n")).trim();
  await h.git("git", ["push", "origin", `${next}:refs/heads/main`]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: "main", condition: expect.stringContaining("host"), remedy: expect.stringContaining("Pull") }),
  ]) } });
  await h.git("git", ["fetch", "origin"]); await h.git("git", ["merge", "--ff-only", "origin/main"]);
  await mergeMainIntoFixtureFlip(h);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it.each(["feat/alpha", "feat/window-flip"])("refuses a fetched %s tip behind the host and passes after another fetch", async branch => {
  const h = await windowFixture(), base = (await h.git("git", ["rev-parse", branch])).stdout.trim();
  const tree = (await h.git("git", ["rev-parse", `${base}^{tree}`])).stdout.trim();
  const next = (await h.ports.execInput(["commit-tree", tree, "-p", base], "Advance the live branch on the host\n")).trim();
  await h.remote("git", ["fetch", "--no-tags", h.root, `${next}:refs/heads/${branch}`]);
  expect((await h.git("git", ["rev-parse", `origin/${branch}`])).stdout.trim()).toBe(base);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: branch, condition: expect.stringContaining(next), remedy: expect.stringContaining("Fetch") }),
  ]) } });
  await h.git("git", ["fetch", "origin"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
  const held = await readWindowHold({ repo: h.root, exec: h.git, execInput: h.ports.execInput });
  expect(held.record.branches).toMatchObject({ host: { [branch]: next }, live: { [branch]: { origin: next } } });
}, 60_000);
