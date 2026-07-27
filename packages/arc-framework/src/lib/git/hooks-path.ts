/**
 * Resolve and classify `core.hooksPath` so callers can refuse when the
 * configured hooks directory is missing.
 *
 * When `core.hooksPath` points at a path that does not exist (typical of an
 * unprovisioned worktree whose husky `.husky/_` was never generated), Git
 * runs **no** hooks and reports success — every quality gate is silently
 * skipped. This helper is the cheap fail-closed check for that case.
 *
 * Intentional disables (`/dev/null`, Windows `NUL`) and an unset hooks path
 * that resolves to an existing default (usually `.git/hooks`) are not
 * treated as missing.
 *
 * @module
 */

import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/** Verdict for a configured hooks path. */
export type HooksPathVerdict =
  | {
      /** Path is usable or intentionally disabled — proceed. */
      kind: "ok";
      /** Absolute path Git will use for hooks, when one exists. */
      resolvedPath: string | null;
      /** Why this is acceptable. */
      reason: "present" | "disabled" | "unset-default-present";
    }
  | {
      /** Configured hooks path does not resolve — refuse mutating work. */
      kind: "missing";
      /** Raw `core.hooksPath` value when known. */
      configured: string | null;
      /** Absolute path Git would use. */
      resolvedPath: string;
    };

/** Injectable boundary for the pure classifier. */
export interface ClassifyHooksPathInput {
  /**
   * Absolute path returned by
   * `git rev-parse --path-format=absolute --git-path hooks`.
   */
  resolvedPath: string;
  /**
   * Raw `git config --get core.hooksPath` value, or `null` when unset.
   */
  configured: string | null;
  /** Whether `resolvedPath` exists on disk (file or directory). */
  exists: boolean;
}

/**
 * Classify a resolved hooks path.
 *
 * @param input - Resolved path, optional raw config, and existence
 * @returns Ok (including intentional disables) or missing
 */
export function classifyHooksPath(input: ClassifyHooksPathInput): HooksPathVerdict {
  const resolved = input.resolvedPath.trim();
  if (resolved === "") {
    return {
      kind: "missing",
      configured: input.configured,
      resolvedPath: resolved,
    };
  }

  if (isDisabledHooksPath(resolved) || isDisabledHooksPath(input.configured ?? "")) {
    return { kind: "ok", resolvedPath: resolved, reason: "disabled" };
  }

  if (input.exists) {
    const reason = input.configured === null || input.configured.trim() === ""
      ? "unset-default-present"
      : "present";
    return { kind: "ok", resolvedPath: resolved, reason };
  }

  return {
    kind: "missing",
    configured: input.configured,
    resolvedPath: resolved,
  };
}

/**
 * Whether a hooks path is an intentional no-op (tests, CI fixtures).
 *
 * @param value - Absolute or configured path fragment
 */
export function isDisabledHooksPath(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, "/").toLowerCase();
  return normalized === "/dev/null"
    || normalized === "nul"
    || normalized === "\\\\.\\nul"
    || normalized.endsWith("/nul");
}

/**
 * Render a refusal message for a missing hooks path.
 *
 * @param verdict - A `missing` verdict
 * @param commandPath - Invoking command for the refusal text (e.g. `arc release commit`)
 */
export function formatMissingHooksPathMessage(
  verdict: Extract<HooksPathVerdict, { kind: "missing" }>,
  commandPath: string,
): string {
  const configured = verdict.configured?.trim()
    ? `'${verdict.configured.trim()}'`
    : "(unset)";
  return (
    `error: configured core.hooksPath ${configured} does not resolve at `
    + `'${verdict.resolvedPath}'. Git will run no hooks and ${commandPath} would `
    + "commit without quality gates. Provision this worktree "
    + "(`npm install` so husky generates hooks, or run the worktree post-create "
    + "script) or fix core.hooksPath, then retry.\n"
  );
}

/** Git-exec shape used to resolve hooks path at runtime. */
export type HooksPathGitExec = (
  command: string,
  args: readonly string[],
  opts: { cwd: string },
) => Promise<{ stdout: string }>;

/**
 * Resolve and classify the live hooks path for `cwd`.
 *
 * @param cwd - Repository / worktree root
 * @param exec - Git executor
 * @param pathExists - Optional existence probe (defaults to `existsSync`)
 */
export async function resolveHooksPathVerdict(
  cwd: string,
  exec: HooksPathGitExec,
  pathExists: (path: string) => boolean = existsSync,
): Promise<HooksPathVerdict> {
  const { stdout: hooksStdout } = await exec(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-path", "hooks"],
    { cwd },
  );
  const resolvedPath = hooksStdout.trim();

  let configured: string | null = null;
  try {
    const { stdout: configStdout } = await exec(
      "git",
      ["config", "--get", "core.hooksPath"],
      { cwd },
    );
    const value = configStdout.trim();
    configured = value === "" ? null : value;
  } catch {
    // `git config --get` exits non-zero when the key is unset.
    configured = null;
  }

  const absolute = isAbsolute(resolvedPath) ? resolvedPath : resolve(cwd, resolvedPath);
  return classifyHooksPath({
    resolvedPath: absolute,
    configured,
    exists: pathExists(absolute),
  });
}
