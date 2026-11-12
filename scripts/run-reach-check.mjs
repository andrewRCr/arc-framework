/** Run the suites a check's change reaches, as the reach declaration named by the first argument states them. */
import { fileURLToPath } from "node:url";
import { gitExec } from "../packages/arc-framework/src/lib/io-context.ts";
import { readReachDeclaration, runReachCheck } from "../packages/arc-framework/src/lib/reach-check.ts";

const checkoutRoot = fileURLToPath(new URL("../", import.meta.url));
const [declarationPath, ...forwarded] = process.argv.slice(2);
try {
  if (declarationPath === undefined) throw new Error("Usage: run-reach-check.mjs <reach-declaration> [vitest arguments]");
  const declaration = await readReachDeclaration(new URL(`../${declarationPath}`, import.meta.url));
  process.chdir(fileURLToPath(new URL(`../${declaration.package}/`, import.meta.url)));
  await runReachCheck({ checkoutRoot, packageRoot: process.cwd(), declarationPath, declaration, arguments: forwarded,
    env: process.env, git: gitExec });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
