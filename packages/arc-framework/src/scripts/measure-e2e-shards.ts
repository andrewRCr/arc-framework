/** Print the duration-balanced E2E membership for every CI shard leg. */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveEffectiveE2EShards } from "../lib/test-cost/shard-run.js";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--duration-file" || !args[1])) {
  throw new Error("Usage: measure-e2e-shards [--duration-file <handed-e2e.json>]");
}
const membership = await deriveEffectiveE2EShards({
  packageRoot,
  workflowPath: join(packageRoot, "..", "..", ".github", "workflows", "ci.yml"),
  env: process.env,
  ...(args[1] === undefined ? {} : { durationFile: args[1] }),
});

process.stdout.write(`${JSON.stringify(membership, null, 2)}\n`);
