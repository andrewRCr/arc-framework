/** Release a completed cutover hold only after origin contains the recorded flip. */
import { readWindowCloseBranchFindings } from "./close-branches.js";
import { listWindowRefs } from "./git.js";
import { readWindowHeldComparisons } from "./held-comparisons.js";
import { windowCloseHeldFindings } from "./close-policy.js";
import { readWindowCloseCheckoutFindings } from "./close-checkouts.js";
import { parseArgs } from "node:util";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { readWindowHold, discardUnfinishedWindowHold, type WindowHoldIO } from "./hold.js";
import { createWindowHost } from "./native-host.js";
import { hasWindowHost, type WindowHostPort } from "./host.js";
import { isWindowFlipMerged } from "./merged-flip.js";
import { WindowRefusal, type WindowResult, type WindowFinding } from "./result.js";
import type { WindowRequest } from "./main.js";

/** Observe the cleanup boundary immediately after the completion marker is deleted. */
export interface WindowCloseOptions { afterComplete?: () => Promise<void> }

/** Preserve the abort point before the merge, then remove its completion marker before its retained refs. */
export async function closeWindow(request: WindowRequest, options: WindowCloseOptions = {}): Promise<WindowResult> {
  parseArgs({ args: [...request.args], options: { repo: { type: "string" }, json: { type: "boolean" } } });
  const ports = createDefaultStorePorts({ checkoutRoot: request.repo }), io = { repo: request.repo, exec: ports.exec, execInput: ports.execInput };
  if (!(await listWindowRefs(io, ["refs/arc-window/"])).has("refs/arc-window/complete")) {
    await discardUnfinishedWindowHold(io);
    return { operation: "close", status: "passed", findings: [], data: { cleanupOnly: true }, messages: ["Incomplete hold cleanup is complete."] };
  }
  const { tip, record } = await readWindowHold(io), host = createWindowHost(io);
  const state = await readWindowHeldComparisons(io, record, await listWindowRefs(io, ["refs/arc-window/"]));
  const messages = [...state.marks.map(mark => `${mark.side}/${mark.branch}: ${mark.kind}; recorded ${mark.recorded ?? "unrecorded"}; mark ${mark.tip}; confirmation ${mark.confirmation ?? "(missing)"}.`),
    ...state.ranges.map(range => `${range.side}/${range.branch}: ${range.kind} range ${range.from}..${range.tip}; confirmation ${range.confirmation ?? "(missing)"}.`)];
  let merged: boolean | null = null;
  try {
    const flip = await readMergedFlip(io, host, record.flip.head);
    merged = flip.merged;
    // A refused merged-flip test has already reported an unreadable host; the branch read would only repeat it.
    const branches = await readWindowCloseBranchFindings(io, record, state, host).catch((error: unknown) => {
      if (flip.merged === null) return [];
      throw error;
    });
    const findings: WindowFinding[] = [...flip.findings, ...windowCloseHeldFindings(record.branches.live, record.flip.branch, state),
      ...await readWindowCloseCheckoutFindings(io), ...branches];
    if (findings.length) return { operation: "close", status: "refused", findings, messages, data: { merged, ...state } };
    await io.exec("git", ["update-ref", "--no-deref", "-d", "refs/arc-window/complete", tip], { cwd: io.repo });
    await options.afterComplete?.();
    await discardUnfinishedWindowHold(io);
    return { operation: "close", status: "passed", findings: [], messages, data: { merged, ...state } };
  } catch (error) {
    return { operation: "close", status: error instanceof WindowRefusal ? "refused" : "stopped",
      findings: error instanceof WindowRefusal ? error.findings : [{ subject: "cutover close",
        condition: error instanceof Error ? error.message : String(error),
        remedy: "Preserve the remaining hold refs, resolve the reported failure, then retry close." }],
      messages, data: { merged, ...state } };
  }
}

/** The merged-flip test as one of close's conditions: its refusal is a finding, and merged stays null. */
async function readMergedFlip(io: WindowHoldIO, host: WindowHostPort, head: string): Promise<{ merged: boolean | null; findings: WindowFinding[] }> {
  try {
    const merged = await isWindowFlipMerged({ ...io, host, hosted: await hasWindowHost(io.exec) }, head);
    return { merged, findings: merged ? [] : [{ subject: "merged flip", condition: "The recorded flip is not merged.",
      remedy: "Preserve the complete hold; finish the window's merge or use restore before retrying close." }] };
  } catch (error) {
    if (error instanceof WindowRefusal) return { merged: null, findings: [...error.findings] };
    throw error;
  }
}
