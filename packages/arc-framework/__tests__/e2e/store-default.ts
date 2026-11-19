/**
 * The end-to-end helpers for a file whose spawned CLI opens the default store: each spawn takes the in-repo store
 * override from the test process rather than from the helpers' default, so it builds the ref backend unless the
 * running test set the override (`useInRepoStore`). A file switches by importing its helpers from here.
 */
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";
import * as helpers from "./helpers.js";

export * from "./helpers.js";

/** The caller's environment over the test process's override, read when the command spawns. */
function inherited(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { [IN_REPO_STORE_OVERRIDE]: process.env[IN_REPO_STORE_OVERRIDE], ...env };
}

/** {@link helpers.runArc} on the test process's store selection. */
export const runArc: typeof helpers.runArc = (args, cwd, options) =>
  helpers.runArc(args, cwd, { ...options, env: inherited(options?.env) });

/** {@link helpers.runArcNoTty} on the test process's store selection. */
export const runArcNoTty: typeof helpers.runArcNoTty = (args, cwd, options) =>
  helpers.runArcNoTty(args, cwd, { ...options, env: inherited(options?.env) });

/** {@link helpers.runArcAnchored} on the test process's store selection. */
export const runArcAnchored: typeof helpers.runArcAnchored = (args, cwd, options) =>
  helpers.runArcAnchored(args, cwd, { ...options, env: inherited(options?.env) });

/** {@link helpers.runArcAnchoredSequence} on the test process's store selection. */
export const runArcAnchoredSequence: typeof helpers.runArcAnchoredSequence = (argsList, cwd, options) =>
  helpers.runArcAnchoredSequence(argsList, cwd, { ...options, env: inherited(options?.env) });

/** {@link helpers.runArcWithStdoutPipe} on the test process's store selection. */
export const runArcWithStdoutPipe: typeof helpers.runArcWithStdoutPipe = (args, cwd, options) =>
  helpers.runArcWithStdoutPipe(args, cwd, { ...options, env: inherited(options?.env) });

/** {@link helpers.runArcWithStdin} on the test process's store selection. */
export const runArcWithStdin: typeof helpers.runArcWithStdin = (args, cwd, stdin, options) =>
  helpers.runArcWithStdin(args, cwd, stdin, { ...options, env: inherited(options?.env) });
