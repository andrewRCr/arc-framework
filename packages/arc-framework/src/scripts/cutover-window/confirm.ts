/** Record the Owner's confirmation of every branch range at exactly its held side tip. */
import { parseArgs } from "node:util";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { updateRefTransaction, type RefChange } from "../../lib/git/ref-transaction.js";
import { readWindowHold } from "./hold.js";
import { listWindowRefs } from "./git.js";
import { readWindowHeldComparisons } from "./held-comparisons.js";
import { windowConfirmationFindings } from "./confirmation.js";
import { WindowRefusal, type WindowResult } from "./result.js";
import type { WindowRequest } from "./main.js";

/** Validate all range operands before atomically verifying marks and writing their confirmations. */
export async function confirmWindow(request: WindowRequest): Promise<WindowResult> {
  const { values, positionals } = parseArgs({ args: [...request.args], allowPositionals: true, options: {
    repo: { type: "string" }, json: { type: "boolean" }, "local-tip": { type: "string" }, "origin-tip": { type: "string" },
  } });
  const branch = positionals[0];
  if (!branch || positionals.length !== 1) throw new WindowRefusal([{ subject: "confirm options",
    condition: "Name exactly one branch to confirm.", remedy: "Use confirm <branch> with each range's --local-tip or --origin-tip." }]);
  const ports = createDefaultStorePorts({ checkoutRoot: request.repo }), io = { repo: request.repo, exec: ports.exec, execInput: ports.execInput };
  await io.exec("git", ["check-ref-format", `refs/heads/${branch}`], { cwd: io.repo });
  const { tip, record } = await readWindowHold(io), held = await listWindowRefs(io, ["refs/arc-window/"]);
  const { ranges } = await readWindowHeldComparisons(io, record, held, branch);
  const findings = windowConfirmationFindings(branch, ranges, { local: values["local-tip"], origin: values["origin-tip"] });
  if (findings.length) throw new WindowRefusal(findings);
  const changes: RefChange[] = [{ ref: "refs/arc-window/complete", next: tip, expected: tip }];
  for (const range of ranges) changes.push({ ref: range.ref, next: range.tip, expected: range.tip },
    { ref: range.confirmationRef, next: range.tip, expected: held.get(range.confirmationRef) ?? null });
  const result = await updateRefTransaction(io, changes, { cwd: io.repo });
  if (result.status !== "committed") throw new WindowRefusal(result.refs.map(ref => ({ subject: ref.ref,
    condition: "The hold or range changed before confirmation.", remedy: "Read compare's current ranges and supply their exact tips again." })));
  return { operation: "confirm", status: "passed", findings: [], data: { branch, ranges: ranges.map(range => ({ ...range, confirmation: range.tip })) },
    messages: ranges.map(range => `${range.side}/${branch}: confirmed ${range.tip}.`) };
}
