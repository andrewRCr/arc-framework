/** Shell-safe rendering for CLI-owned decomposition workflow and recovery commands. */

/** Quote one opaque decomposition command operand for POSIX-shell display. */
export function renderV3DecomposeCommandArgument(value: string): string {
  return /^[A-Za-z0-9_./:@+-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function renderCommand(argv: readonly string[]): string {
  return argv.map(renderV3DecomposeCommandArgument).join(" ");
}

/** Build the read-only preflight invocation without shell reconstruction. */
export function v3DecomposePreflightArgv(origin: string): readonly string[] {
  return ["arc", "decompose", origin, "--preflight"];
}

/** Build one exact retirement invocation without shell reconstruction. */
export function v3DecomposeExecuteArgv(origin: string, cutMapPath: string): readonly string[] {
  return ["arc", "decompose", origin, "--execute", cutMapPath];
}

/** Build one exact extraction invocation without shell reconstruction. */
export function v3DecomposeExtractArgv(origin: string, cutMapPath: string): readonly string[] {
  return ["arc", "decompose", origin, "--extract", cutMapPath];
}

/** Build one exact finish-preview invocation without shell reconstruction. */
export function v3DecomposeFinishPreviewArgv(
  origin: string,
  cutMapPath: string,
): readonly string[] {
  return ["arc", "decompose", origin, "--finish", cutMapPath];
}

/** Build one exact finish-apply invocation without shell reconstruction. */
export function v3DecomposeFinishApplyArgv(
  origin: string,
  cutMapPath: string,
  applyAuthority: string,
): readonly string[] {
  return ["arc", "decompose", origin, "--finish", cutMapPath, "--apply", applyAuthority];
}

/** Build one exact base-advancement invocation without shell reconstruction. */
export function v3DecomposeAdvanceBaseArgv(
  origin: string,
  cutMapPath: string,
): readonly string[] {
  return ["arc", "decompose", origin, "--advance-base", cutMapPath];
}

/** Render the read-only preflight command for one provenance-backed origin. */
export function renderV3DecomposePreflightCommand(origin: string): string {
  return renderCommand(v3DecomposePreflightArgv(origin));
}

/** Render an execute command from one exact canonical cut-map invocation. */
export function renderV3DecomposeExecuteCommand(
  origin: string,
  cutMapPath: string,
): string {
  return renderCommand(v3DecomposeExecuteArgv(origin, cutMapPath));
}

/** Render an additive extraction command from one exact canonical cut-map invocation. */
export function renderV3DecomposeExtractCommand(
  origin: string,
  cutMapPath: string,
): string {
  return renderCommand(v3DecomposeExtractArgv(origin, cutMapPath));
}

/** Render committed-candidate base advancement from one canonical cut map. */
export function renderV3DecomposeAdvanceBaseCommand(
  origin: string,
  cutMapPath: string,
): string {
  return renderCommand(v3DecomposeAdvanceBaseArgv(origin, cutMapPath));
}
