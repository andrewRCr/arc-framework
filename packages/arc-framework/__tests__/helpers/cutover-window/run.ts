/** Drive repository-only window operations through their normal argument and output boundary. */
import { runWindow, type WindowHandlers, type WindowResult } from "../../../src/scripts/cutover-window/main.js";
import { withoutInRepoStore } from "../in-repo-store-override.js";

/** The operations that read only Git and disk, so they run from either build: without the in-repo store override, as
 * after the merge, even in a test that runs the window's earlier operations under it. */
export const EITHER_BUILD_OPERATIONS: ReadonlySet<string> = new Set(["compare", "confirm", "close"]);

/** Invoke the source handler seam and retain both structured output and the operator report. */
export async function invokeWindow(root: string, operation: string, args: readonly string[] = [], handlers?: WindowHandlers) {
  const stdout: string[] = [], stderr: string[] = [];
  const run = () => runWindow([operation, "--repo", root, "--json", ...args], handlers,
    { stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); } });
  const exit = EITHER_BUILD_OPERATIONS.has(operation) ? await withoutInRepoStore(run) : await run();
  return { exit, result: stdout.length ? JSON.parse(stdout.join("")) as WindowResult : null, report: stderr.join("") };
}
