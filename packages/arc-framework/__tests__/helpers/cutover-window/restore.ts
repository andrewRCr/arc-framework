/** Drive restore admission through the family's actual argument parser and result boundary. */
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
