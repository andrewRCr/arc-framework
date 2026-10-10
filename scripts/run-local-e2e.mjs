/** Execute the local E2E suite after path-based check selection. */
import { fileURLToPath } from "node:url";
import { runLocalVitestTier } from "../packages/arc-framework/src/lib/local-vitest-runner.ts";

process.chdir(fileURLToPath(new URL("../packages/arc-framework/", import.meta.url)));
await runLocalVitestTier("e2e", []);
