/** A separate process holding the advisory lock at the given path until its standard input asks it to release. */

import { acquireAdvisoryLock, releaseAdvisoryLock } from "../../../src/lib/advisory-lock.js";

const lockPath = process.argv[2];
if (!lockPath) throw new Error("A lock holder requires a lock path");
const held = await acquireAdvisoryLock(lockPath);
process.stdout.write("READY\n");
await new Promise((resolve) => process.stdin.once("data", resolve));
await releaseAdvisoryLock(held);
