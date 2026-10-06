/** Print the effective E2E remainder membership for every CI shard leg. */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveEffectiveE2EShards } from "../lib/test-cost/shard-run.js";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const membership = await deriveEffectiveE2EShards({
  packageRoot,
  workflowPath: join(packageRoot, "..", "..", ".github", "workflows", "ci.yml"),
  env: process.env,
});

process.stdout.write(`${JSON.stringify(membership, null, 2)}\n`);
