/** Thin Node entry for the owning repository build command. */
import { resolve } from "node:path";
import { runBuildCommand } from "../lib/build-command.js";

try {
  await runBuildCommand(resolve(import.meta.dirname, "../.."), process.argv.slice(2));
  process.stdout.write("Build artifacts qualified.\n");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
