/** Shell-safe rendering for CLI-owned decomposition workflow and recovery commands. */

import type { CanonicalDigest } from "../canonical/canonical-json.js";

/** Quote one opaque decomposition command operand for POSIX-shell display. */
export function renderV3DecomposeCommandArgument(value: string): string {
  return /^[A-Za-z0-9_./:@+-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function commandOrigin(origin: string): string {
  return `arc decompose ${renderV3DecomposeCommandArgument(origin)}`;
}

/** Render the read-only preflight command for one provenance-backed origin. */
export function renderV3DecomposePreflightCommand(origin: string): string {
  return `${commandOrigin(origin)} --preflight`;
}

/** Render an execute command from one exact canonical cut-map invocation. */
export function renderV3DecomposeExecuteCommand(
  origin: string,
  cutMapPath: string,
): string {
  return `${commandOrigin(origin)} --execute ${
    renderV3DecomposeCommandArgument(cutMapPath)
  }`;
}

/** Render an exact-candidate discard command from one canonical cut-map invocation. */
export function renderV3DecomposeDiscardCommand(
  origin: string,
  cutMapPath: string,
): string {
  return `${commandOrigin(origin)} --discard ${
    renderV3DecomposeCommandArgument(cutMapPath)
  }`;
}

/** Render finalization from one exact receipt and continuation-input path. */
export function renderV3DecomposeFinalizeCommand(
  origin: string,
  receiptId: CanonicalDigest,
  continuationPath: string,
): string {
  return `${commandOrigin(origin)} --finalize ${receiptId} `
    + `--continuation ${renderV3DecomposeCommandArgument(continuationPath)}`;
}
