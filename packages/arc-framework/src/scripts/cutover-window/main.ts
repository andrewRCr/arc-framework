/** Repository-only entry for cutover window operations on an explicitly named checkout. */
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { emitWindowResult } from "./result.js";
import type { WindowResult, WindowOutput } from "./result.js";
export type { WindowFinding, WindowResult, WindowOutput } from "./result.js";

/** Explicit target and original arguments handed to an operation. */
export interface WindowRequest { repo: string; args: readonly string[] }
/** Operations available at this source revision. */
export type WindowHandlers = Readonly<Record<string, (request: WindowRequest) => Promise<WindowResult>>>;
/** Run the family entry, returning the process exit status. */
export async function runWindow(
  args: readonly string[], handlers: WindowHandlers = {},
  output: WindowOutput = { stdout: text => { process.stdout.write(text); }, stderr: text => { process.stderr.write(text); } },
): Promise<number> {
  try {
    const operation = args[0] ?? "";
    if (!Object.hasOwn(handlers, operation)) throw new Error(`Unsupported operation: ${operation || "(missing)"}`);
    const { values } = parseArgs({ args: [...args.slice(1)], allowPositionals: true, strict: false,
      options: { repo: { type: "string" }, json: { type: "boolean" } } });
    if (typeof values.repo !== "string" || values.repo.length === 0) throw new Error("An explicit --repo is required");
    const handler = handlers[operation];
    if (handler === undefined) throw new Error(`Unsupported operation: ${operation}`);
    const result = await handler({ repo: resolve(values.repo), args: args.slice(1) });
    return emitWindowResult(result, values.json === true, output);
  } catch (error) {
    output.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    output.stderr("Usage: cutover-window <operation> --repo <checkout> [--json] [operation options]\n");
    return 1;
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await runWindow(process.argv.slice(2));
}
