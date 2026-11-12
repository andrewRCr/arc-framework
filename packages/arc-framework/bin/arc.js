#!/usr/bin/env node
/**
 * ARC CLI launcher.
 *
 * Turns on Node's on-disk compile cache before the CLI bundle loads, so later starts reuse the bundle's
 * compiled code instead of compiling it again. The bundle cannot do this for itself, because Node compiles
 * it before its first statement runs. `NODE_DISABLE_COMPILE_CACHE=1` turns the cache off, and
 * `NODE_COMPILE_CACHE` chooses its directory.
 */
import { enableCompileCache } from "node:module";

enableCompileCache();
await import("../dist/cli.js");
