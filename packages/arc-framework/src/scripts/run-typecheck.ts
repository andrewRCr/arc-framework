/** Thin Node entry for the package's type checks and typed linting. */
import { resolve } from "node:path";
import { runTypecheckCommand } from "./typecheck/run.js";

try {
  process.exitCode = await runTypecheckCommand(resolve(import.meta.dirname, "../.."), process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
