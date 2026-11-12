/** Repository-root focused lint with native package-cwd suppression and exit semantics. */
import { execa } from "execa";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { normalizeFocusedLintInput } from "../lib/focused-lint-input.js";

try {
  const input = normalizeFocusedLintInput(resolve(import.meta.dirname, "../../../.."), process.argv.slice(2));
  const require = createRequire(join(input.packageRoot, "package.json"));
  const cli = join(dirname(require.resolve("eslint/package.json")), "bin/eslint.js");
  const result = await execa(process.execPath, [cli, ...input.arguments],
    { cwd: input.packageRoot, stdio: "inherit", reject: false });
  process.exitCode = result.exitCode ?? 1;
} catch (error) { console.error(error); process.exitCode ||= 1; }
