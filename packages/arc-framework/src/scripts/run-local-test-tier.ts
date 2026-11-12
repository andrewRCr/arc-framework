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
} from "../lib/local-test-admission.js";
import { EMPTY_RELATED_SELECTION_EXIT_CODE, runLocalVitestTier } from "../lib/local-vitest-runner.js";
import { EmptyVitestSelectionError } from "../lib/vitest-discovery.js";

const [tierArgument, ...forwardedArguments] = process.argv.slice(2);
const tier = parseTier(tierArgument);

try {
  await runLocalVitestTier(tier, forwardedArguments);
} catch (error) {
  // Only a related run may find nothing to run; any other tier's empty selection is a configuration failure.
  if (tier !== "changed" || !(error instanceof EmptyVitestSelectionError)) throw error;
  console.error("No unit tests reach the changed files, so this run is no evidence that they work.");
  // Closing the controller may already have recorded a failure, which must not read as missing evidence.
  process.exitCode ||= EMPTY_RELATED_SELECTION_EXIT_CODE;
}

function parseTier(value: string | undefined): LocalHeavyTestTier {
  if (isLocalHeavyTestTier(value)) return value;
  throw new Error(`Unknown local heavy-test tier: ${value ?? "(missing)"}`);
}
