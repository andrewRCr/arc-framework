/**
 * Advance the base from its own process, for sequences that cannot call into the harness.
 *
 * A lane that closes inside one persistent shell sequence can only interleave a step it can spawn.
 * This runner is that step: it takes the same options the in-process entry point takes, so both
 * call forms move the base through one implementation rather than two that can drift apart.
 *
 * Invoked as:
 *   base-advance-step.ts '<options JSON>'
 *
 * Prints the advanced head as one line of JSON on success; prints the error and exits non-zero
 * otherwise.
 *
 * @module
 */

import { advanceBase, type BaseAdvanceOptions } from "./base-advance.js";

const [serialized, ...extra] = process.argv.slice(2);
if (serialized === undefined || extra.length > 0) {
  process.stderr.write("base-advance-step: expected exactly one options JSON argument\n");
  process.exit(1);
}

try {
  const options = JSON.parse(serialized) as BaseAdvanceOptions;
  const result = await advanceBase(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`base-advance-step: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
