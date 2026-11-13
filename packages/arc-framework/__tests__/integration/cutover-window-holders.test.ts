/** Native ownership refusals use the same checkout lifecycle view as status. */
import { join } from "node:path";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture, mergeMainIntoFixtureFlip } from "../helpers/cutover-window/check.js";
import { readStatusCheckoutRoster } from "../../src/handlers/status/checkout-roster.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { ordinaryErrand, seedTransients } from "../helpers/store/import-transients.js";

it("refuses an unmarked linked checkout and passes after it is removed", async () => {
  const h = await windowFixture();
  const path = join(h.root, ".arc-fixture/unmarked");
  await h.git("git", ["worktree", "add", "--detach", path]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: path, condition: expect.stringContaining("no-marker"), remedy: expect.stringContaining("git worktree remove") }),
  ]) } });
  await h.git("git", ["worktree", "remove", path]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("exposes the primary fixture's native status role", async () => {
  const h = await windowFixture();
  expect(await readStatusCheckoutRoster({ cwd: h.root, exec: h.git }, "andrew")).toEqual([
    expect.objectContaining({ kind: "free-primary" }),
  ]);
}, 30_000);

it("refuses the primary's unresolved status role and passes after its topology is repaired", async () => {
  const h = await windowFixture();
  await h.git("git", ["checkout", "feat/alpha", "--", ".arc/active/meta-alpha.md"]);
  await h.git("git", ["commit", "-m", "Put active branch ownership on the wrong checkout"]);
  await h.git("git", ["push", "origin", "main"]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: h.root, condition: expect.stringMatching(/unresolved-checkout.*alpha/u),
      remedy: expect.stringContaining("Observed checkout topology does not corroborate") }),
  ]) } });
  await h.git("git", ["rm", ".arc/active/meta-alpha.md"]);
  await h.git("git", ["commit", "-m", "Restore the free launchpad"]);
  await h.git("git", ["push", "origin", "main"]);
  await mergeMainIntoFixtureFlip(h);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("refuses a husked marked checkout and passes after its registration is removed", async () => {
  const h = await windowFixture();
  const path = join(h.root, ".arc-fixture/alpha");
  await h.git("git", ["worktree", "add", path, "feat/alpha"]);
  const head = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  await writeWorktreeMarker(path, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "work-unit", name: "alpha" }, husk: { sha: head, at: "2026-01-01T00:00:00.000Z",
      subject: { kind: "work-unit", name: "alpha" }, branch: "feat/alpha" } });
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: path, condition: expect.stringMatching(/husk.*alpha/u), remedy: expect.stringContaining("arc teardown alpha") }),
  ]) } });
  await h.git("git", ["worktree", "remove", path]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("refuses an Errand marker without an exact identity record and passes after its record is restored", async () => {
  const h = await windowFixture();
  const path = join(h.root, ".arc-fixture/errand");
  await h.git("git", ["branch", "chore/example"]);
  await h.git("git", ["push", "--set-upstream", "origin", "chore/example"]);
  await h.git("git", ["worktree", "add", path, "chore/example"]);
  await h.git("git", ["worktree", "lock", path]);
  await writeWorktreeMarker(path, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "errand", slug: "example", claimId: "1".repeat(32) }, provisioning: "ready" });
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: path, condition: expect.stringMatching(/example.*11111111.*no.*record/u),
      remedy: expect.stringContaining("arc locus release") }),
  ]) } });
  await h.git("git", ["worktree", "unlock", path]);
  await h.git("git", ["worktree", "remove", path]);
  await h.git("git", ["branch", "-d", "chore/example"]);
  await seedTransients(h, [ordinaryErrand]);
  await h.git("git", ["worktree", "add", path, "chore/example"]);
  await h.git("git", ["worktree", "lock", path]);
  await h.git("git", ["branch", "--set-upstream-to=origin/chore/example", "chore/example"]);
  await writeWorktreeMarker(path, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "errand", slug: "example", claimId: "1".repeat(32) }, provisioning: "ready" });
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);
