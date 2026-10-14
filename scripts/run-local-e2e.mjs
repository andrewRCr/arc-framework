/** Execute the local E2E check over the paths its check selection supplied. */
import { fileURLToPath } from "node:url";
import { runLocalE2eCheck } from "../packages/arc-framework/src/lib/local-vitest-runner.ts";

const checkoutRoot = fileURLToPath(new URL("../", import.meta.url));
process.chdir(fileURLToPath(new URL("../packages/arc-framework/", import.meta.url)));
await runLocalE2eCheck(checkoutRoot, process.argv.slice(2));
