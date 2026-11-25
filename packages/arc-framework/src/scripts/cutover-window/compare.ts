/** Retain one branch's post-import observations, or report one checkout's personal changes. */
import { compareWindowCheckout } from "./compare-checkout.js";
import { windowComparisonRange } from "./comparison-marks.js";
import { readWindowBranchObservations } from "./branch-observations.js";
import { parseArgs } from "node:util";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { updateRefTransaction, type RefChange } from "../../lib/git/ref-transaction.js";
import { readWindowHold, type WindowHoldIO } from "./hold.js";
import { listWindowRefs } from "./git.js";
import { WindowRefusal, type WindowResult } from "./result.js";
import type { WindowRequest } from "./main.js";

/** Compare exactly one branch or checkout without treating a late change as a reason to stop its window step. */
export async function compareWindow(request: WindowRequest): Promise<WindowResult> {
  const { values } = parseArgs({ args: [...request.args], options: { repo: { type: "string" }, json: { type: "boolean" },
    branch: { type: "string" }, checkout: { type: "string" } } });
  if (Boolean(values.branch) === Boolean(values.checkout)) throw new WindowRefusal([{ subject: "compare options", condition: "Name exactly one branch or checkout.", remedy: "Supply one --branch or --checkout and retry compare." }]);
  const ports = createDefaultStorePorts({ checkoutRoot: request.repo });
  const io = { repo: request.repo, exec: ports.exec, execInput: ports.execInput };
  const { record } = await readWindowHold(io);
  if (values.checkout) return compareWindowCheckout(io, record, values.checkout);
  const branch = values.branch ?? "";
  await io.exec("git", ["check-ref-format", `refs/heads/${branch}`], { cwd: io.repo });
  const marks = await readWindowBranchObservations(io, record, branch);
  await writeWindowComparisonMarks(io, branch, marks);
  const ranges = marks.flatMap(mark => { const range = windowComparisonRange(mark); return range === null ? [] : [range]; });
  return { operation: "compare", status: "reported", findings: [], data: { branch, marks, ranges },
    messages: ranges.map(range => `${range.side}/${branch}: ${range.kind} ${range.from}..${range.tip}`) };
}

interface ComparisonMark { side: "local" | "origin"; kind: "compared" | "gone"; tip: string }

/** Replace one branch's marks atomically while leaving confirmations bound to their original tips. */
async function writeWindowComparisonMarks(io: WindowHoldIO, branch: string, marks: readonly ComparisonMark[]): Promise<void> {
  const held = await listWindowRefs(io, ["refs/arc-window/"]), changes: RefChange[] = [];
  for (const mark of marks) {
    const ref = `refs/arc-window/${mark.kind}/${mark.side}/${branch}`;
    changes.push({ ref, next: mark.tip, expected: held.get(ref) ?? null });
    const opposite = `refs/arc-window/${mark.kind === "compared" ? "gone" : "compared"}/${mark.side}/${branch}`;
    const previous = held.get(opposite);
    if (previous !== undefined) changes.push({ ref: opposite, delete: true, expected: previous });
  }
  if (!changes.length) return;
  const result = await updateRefTransaction(io, changes, { cwd: io.repo });
  if (result.status !== "committed") throw new WindowRefusal(result.refs.map(ref => ({ subject: ref.ref,
    condition: "A comparison mark changed during replacement.", remedy: "Preserve the current marks and retry compare." })));
}
