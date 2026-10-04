/** Repository-root focused test entry with literal native arguments. */
import { resolve } from "node:path";
import { parseFocusedTestInput } from "../lib/focused-test-input.js";
import { discoverFocusedVitestSelection } from "../lib/focused-test-selection.js";
import { executeVitestSelection } from "../lib/vitest-execution.js";

try {
  const checkoutRoot = resolve(import.meta.dirname, "../../../..");
  const input = parseFocusedTestInput(checkoutRoot, process.argv.slice(2));
  process.chdir(input.packageRoot);
  const selection = await discoverFocusedVitestSelection(input);
  await executeVitestSelection(selection, { cwd: input.packageRoot, packageRoot: input.packageRoot,
    env: process.env, tier: "focused" });
} catch (error) { console.error(error); process.exitCode ||= 1; }
