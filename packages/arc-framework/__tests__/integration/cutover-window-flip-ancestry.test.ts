/** A window starts only while main is a proper ancestor of the named flip branch. */
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";

it("refuses a flip equal to main and passes once the flip takes a commit", async () => {
  const h = await windowFixture();
  const main = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  await h.git("git", ["update-ref", `refs/heads/${h.flip.branch}`, main, h.flip.head]);
  await h.remote("git", ["update-ref", `refs/heads/${h.flip.branch}`, main, h.flip.head]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: h.flip.branch, condition: expect.stringContaining("proper ancestor") }),
  ]) } });
  await h.git("git", ["checkout", h.flip.branch]);
  await h.git("git", ["commit", "--allow-empty", "-m", "Advance the flip beyond main"]);
  await h.git("git", ["push", "origin", h.flip.branch]); await h.git("git", ["checkout", "main"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses a flip missing main's latest commit and passes once main is merged into it", async () => {
  const h = await windowFixture();
  await h.git("git", ["commit", "--allow-empty", "-m", "Advance main past the flip's base"]);
  await h.git("git", ["push", "origin", "main"]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: h.flip.branch, condition: expect.stringContaining("proper ancestor") }),
  ]) } });
  await h.git("git", ["checkout", h.flip.branch]); await h.git("git", ["merge", "--no-edit", "main"]);
  await h.git("git", ["push", "origin", h.flip.branch]); await h.git("git", ["checkout", "main"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);
