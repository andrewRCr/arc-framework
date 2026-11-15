/** Native Git steps that put a temporary importing checkout past its flip and tracked-state deletion. */
import type { windowFixture } from "./fixture.js";
import { WINDOW_TRACKED_STATE_ROOTS } from "../../../src/scripts/cutover-window/tracked-state.js";

/** Delete the tracked state through Git and publish only to the fixture's local mirror. */
export async function removeFixtureTrackedState(h: Awaited<ReturnType<typeof windowFixture>>): Promise<void> {
  await h.git("git", ["rm", "-r", "--ignore-unmatch", "--", ...WINDOW_TRACKED_STATE_ROOTS]);
  await h.git("git", ["commit", "-m", "Remove tracked operational state"]);
  await h.git("git", ["push", "origin", "main"]);
}

/** Merge the fixture's recorded flip and finish its main-tree deletion. */
export async function finishFixtureFlip(h: Awaited<ReturnType<typeof windowFixture>>): Promise<void> {
  await h.git("git", ["merge", "--no-ff", h.flip.branch, "-m", "Merge window flip"]);
  await removeFixtureTrackedState(h);
}
