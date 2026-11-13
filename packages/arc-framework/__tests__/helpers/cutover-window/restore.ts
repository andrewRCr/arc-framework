/** Drive restore admission through the family's actual argument parser and result boundary. */
import { recordWindowRestoreDecision } from "../../../src/scripts/cutover-window/restore-decision.js";
import { runWindow } from "../../../src/scripts/cutover-window/main.js";
import { admitWindowRestore, type WindowRestoreOptions } from "../../../src/scripts/cutover-window/restore.js";
import type { windowFixture } from "./fixture.js";

/** Exercise admission without entering the restore's mutation sequence. */
export async function admitRestoreFixture(h: Awaited<ReturnType<typeof windowFixture>>, options: WindowRestoreOptions = {}, listing = true) {
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow(["restore", "--repo", h.root, "--flip-branch", h.flip.branch, "--flip-pr", String(h.flip.pullRequest),
    ...listing ? ["--pull-requests", h.listingPath] : [], "--json"], { restore: async request => {
    await admitWindowRestore(request, options);
    return { operation: "restore", status: "reported", findings: [] };
  } }, { stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); } });
  return { exit, result: JSON.parse(stdout.join("")) as unknown, report: stderr.join("") };
}

/** Drive comparison recording through parsed restore inputs without resetting any ref yet. */
export async function recordRestoreFixture(h: Awaited<ReturnType<typeof windowFixture>>, accepted: readonly string[] = [],
  options: WindowRestoreOptions = {}) {
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow(["restore", "--repo", h.root, "--flip-branch", h.flip.branch, "--flip-pr", String(h.flip.pullRequest),
    "--pull-requests", h.listingPath, ...accepted.flatMap(value => ["--accept", value]), "--json"], { restore: async request => {
    const context = await admitWindowRestore(request, options);
    const data = await recordWindowRestoreDecision(context);
    return { operation: "restore", status: "reported", findings: [], data };
  } }, { stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); } });
  return { exit, result: JSON.parse(stdout.join("")) as unknown, report: stderr.join("") };
}
