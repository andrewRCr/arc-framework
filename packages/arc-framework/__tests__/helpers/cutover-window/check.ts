/** Drive the real check handler through the family's common argument parser and result emitter. */
import { runWindow } from "../../../src/scripts/cutover-window/main.js";
import { checkWindow, type WindowCheckOptions } from "../../../src/scripts/cutover-window/check.js";
import type { windowFixture } from "./fixture.js";

/** Invoke the check with the shared fixture's explicit repository and rehearsal facts. */
export async function checkFixture(h: Awaited<ReturnType<typeof windowFixture>>, options: WindowCheckOptions = {},
  extra: readonly string[] = ["--path", ""]) {
  const stdout: string[] = []; const stderr: string[] = [];
  const exit = await runWindow(["check", "--repo", h.root, "--flip-branch", h.flip.branch,
    "--flip-pr", String(h.flip.pullRequest), "--pull-requests", h.listingPath, "--json", ...extra], { check: request => checkWindow(request, options) }, {
    stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); },
  });
  return { exit, result: JSON.parse(stdout.join("")) as unknown, report: stderr.join("") };
}

/** Carry a fixture's main advancement to its stand-in flip before expecting full quiescence. */
export async function mergeMainIntoFixtureFlip(h: Awaited<ReturnType<typeof windowFixture>>): Promise<void> {
  await h.git("git", ["checkout", h.flip.branch]);
  await h.git("git", ["merge", "--no-edit", "main"]);
  await h.git("git", ["push", "origin", h.flip.branch]);
  await h.git("git", ["checkout", "main"]);
}
