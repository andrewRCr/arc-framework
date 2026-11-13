/** Repository-only entry for cutover window operations on an explicitly named checkout. */
import { closeWindow } from "./close.js";
import { confirmWindow } from "./confirm.js";
import { compareWindow } from "./compare.js";
import { chainWindow } from "./chain.js";
import { accountWindow } from "./account.js";
import { lastReadWindow } from "./last-read.js";
import { recomputeWindow } from "./recompute.js";
import { checkWindow } from "./check.js";
import { restoreWindow } from "./restore-operation.js";
import { lockWindow } from "./lock.js";
import { copyWindow } from "./copy.js";
import { rehearseWindow } from "./rehearse.js";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { emitWindowResult, WindowRefusal } from "./result.js";
import type { WindowResult, WindowOutput } from "./result.js";
export type { WindowFinding, WindowResult, WindowOutput } from "./result.js";

/** Explicit target and original arguments handed to an operation. */
export interface WindowRequest { repo: string; args: readonly string[] }
/** Operations available at this source revision. */
export type WindowHandlers = Readonly<Record<string, (request: WindowRequest) => Promise<WindowResult>>>;
/** Run the family entry, returning the process exit status. */
export async function runWindow(
  args: readonly string[], handlers: WindowHandlers = { close: closeWindow, confirm: confirmWindow, compare: compareWindow, check: checkWindow, account: accountWindow, chain: chainWindow, recompute: recomputeWindow, "last-read": lastReadWindow, restore: restoreWindow, lock: lockWindow, copy: copyWindow, rehearse: request => rehearseWindow(request) },
  output: WindowOutput = { stdout: text => { process.stdout.write(text); }, stderr: text => { process.stderr.write(text); } },
): Promise<number> {
  let operationStarted = false;
  try {
    const operation = args[0] ?? "";
    if (!Object.hasOwn(handlers, operation)) throw new Error(`Unsupported operation: ${operation || "(missing)"}`);
    const { values } = parseArgs({ args: [...args.slice(1)], allowPositionals: true, strict: false,
      options: { repo: { type: "string" }, json: { type: "boolean" } } });
    if (typeof values.repo !== "string" || values.repo.length === 0) throw new Error("An explicit --repo is required");
    const handler = handlers[operation];
    if (handler === undefined) throw new Error(`Unsupported operation: ${operation}`);
    operationStarted = true;
    const result = await handler({ repo: resolve(values.repo), args: args.slice(1) });
    return emitWindowResult(result, values.json === true, output);
  } catch (error) {
    if (error instanceof WindowRefusal) {
      return emitWindowResult({ operation: args[0] ?? "window", status: "refused", findings: error.findings },
        args.includes("--json"), output);
    }
    if (operationStarted) {
      return emitWindowResult({ operation: args[0] ?? "window", status: "stopped", findings: [{
        subject: args[0] ?? "window", condition: error instanceof Error ? error.message : String(error),
        remedy: "Resolve the reported condition in the target checkout, then retry.",
      }] }, args.includes("--json"), output);
    }
    output.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    output.stderr("Usage: cutover-window <operation> --repo <checkout> [--json] [operation options]\n");
    return 1;
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await runWindow(process.argv.slice(2));
}
