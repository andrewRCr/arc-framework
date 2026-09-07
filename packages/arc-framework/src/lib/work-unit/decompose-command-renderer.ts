/** Shell-safe rendering for CLI-owned decomposition workflow and recovery commands. */

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

/** Render an additive extraction command from one exact canonical cut-map invocation. */
export function renderV3DecomposeExtractCommand(
  origin: string,
  cutMapPath: string,
): string {
  return `${commandOrigin(origin)} --extract ${
    renderV3DecomposeCommandArgument(cutMapPath)
  }`;
}

/** Render committed-candidate base advancement from one canonical cut map. */
export function renderV3DecomposeAdvanceBaseCommand(
  origin: string,
  cutMapPath: string,
): string {
  return `${commandOrigin(origin)} --advance-base ${
    renderV3DecomposeCommandArgument(cutMapPath)
  }`;
}
