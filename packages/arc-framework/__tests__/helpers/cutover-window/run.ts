/** Drive repository-only window operations through their normal argument and output boundary. */
import { runWindow, type WindowHandlers, type WindowResult } from "../../../src/scripts/cutover-window/main.js";

/** Invoke the source handler seam and retain both structured output and the operator report. */
export async function invokeWindow(root: string, operation: string, args: readonly string[] = [], handlers?: WindowHandlers) {
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow([operation, "--repo", root, "--json", ...args], handlers,
    { stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); } });
  return { exit, result: stdout.length ? JSON.parse(stdout.join("")) as WindowResult : null, report: stderr.join("") };
}
