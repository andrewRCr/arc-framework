/** Preserve machine-readable usage failures at the native check parser boundary. */
import type { CommanderError } from "commander";

/** Version shared by native usage errors and declared-check result envelopes. */
export const CHECK_REQUEST_SCHEMA_VERSION = 1 as const;

function jsonRequested(): boolean {
  const args = process.argv.slice(2);
  const delimiter = args.indexOf("--");
  return args.slice(0, delimiter === -1 ? undefined : delimiter).includes("--json");
}

/**
 * Keep native diagnostics on stderr for human invocations only.
 * @param message - Diagnostic emitted before the parser's exit callback
 * @returns Nothing
 */
export function writeCheckParserDiagnostic(message: string): void {
  if (!jsonRequested()) process.stderr.write(message);
}

/**
 * Bind native parser failures to the check exit and envelope contracts.
 * @param error - Native parser refusal, help completion, or version completion
 * @returns Never; the root error handler retains the assigned exit status
 */
export function throwCheckParserResult(error: CommanderError): never {
  if (error.exitCode !== 0) {
    error.exitCode = 2;
    if (jsonRequested()) process.stdout.write(`${JSON.stringify({ schemaVersion: CHECK_REQUEST_SCHEMA_VERSION,
      error: { kind: "usage", code: error.code, message: error.message } })}\n`);
  }
  throw error;
}
