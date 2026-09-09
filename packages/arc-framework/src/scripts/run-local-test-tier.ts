/**
 * In-process Vitest entry point for repository-wide local heavy-test admission.
 *
 * The process that owns the lock is the Vitest controller itself. Keeping those
 * lifetimes identical lets dead-controller detection reclaim an abandoned lock
 * without admitting a second run alongside a surviving wrapper child.
 *
 * @module
 */

import {
  isLocalHeavyTestTier,
  type LocalHeavyTestTier,
  withLocalHeavyTestAdmission,
} from "../lib/local-test-admission.js";
import { runLocalVitestTier } from "../lib/local-vitest-runner.js";

const [tierArgument, ...forwardedArguments] = process.argv.slice(2);
const tier = parseTier(tierArgument);

await withLocalHeavyTestAdmission(
  {
    cwd: process.cwd(),
    env: process.env,
    tier,
  },
  async () => {
    await runLocalVitestTier(tier, forwardedArguments);
  },
);

function parseTier(value: string | undefined): LocalHeavyTestTier {
  if (isLocalHeavyTestTier(value)) return value;
  throw new Error(`Unknown local heavy-test tier: ${value ?? "(missing)"}`);
}
