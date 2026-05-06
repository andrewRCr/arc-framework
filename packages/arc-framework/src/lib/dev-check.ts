/**
 * Dev-mode stale-build check for the self-hosting repo.
 *
 * In this repo, `npx arc` resolves through the workspace symlink to
 * `packages/arc-framework/dist/cli.js`. `dist/` is gitignored, so after a
 * `git pull` or local source edit, `dist/cli.js` can lag behind `src/`.
 * Handoff-critical commands (`arc sync`, `arc user save`, `arc user push`,
 * session-init / session-handoff status probes) cannot afford to run against
 * stale dist — their output drives cross-machine state and a stale build
 * silently produces wrong answers.
 *
 * Adopters never see the check. The dev-mode discriminator is `src/`
 * adjacency from the running `dist/cli.js`: published installs don't carry
 * `src/` (excluded from the package's `files` array), so the helper returns
 * `{ kind: "skip" }` and the CLI proceeds as normal.
 *
 * The pure verdict function takes injected fs primitives so tests can pin
 * each shape without touching the real filesystem. Allowlist branching
 * (handoff-critical fail-fast vs warn-only) lives at the cli.ts preAction
 * boundary.
 *
 * @module
 */

import { existsSync, statSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** Verdict returned by {@link checkDevBuildStaleness}. */
export type DevCheckResult =
  | { kind: "skip" }
  | { kind: "fresh" }
  | {
      kind: "stale";
      /** Seconds since the newest src change. */
      srcAge: number;
      /** Seconds since dist/cli.js was built. `null` when dist is missing. */
      distAge: number | null;
      /** Repo-relative path of the newest src file. */
      newestSrc: string;
    };

/** Injectable dependencies for the dev-check verdict function. */
export interface DevCheckDeps {
  /**
   * Resolve the newest src/**\/*.ts file (mtime + repo-relative path), or
   * `null` when `src/` does not exist (published-install case).
   */
  newestSrc: () => { mtimeMs: number; path: string } | null;
  /**
   * Resolve `dist/cli.js` mtime in ms, or `null` when the file is missing
   * (function-level case; runtime is unreachable since the CLI wouldn't
   * launch without dist/cli.js).
   */
  distMtimeMs: () => number | null;
  /** Current time in ms — injectable for deterministic age calculations. */
  now: () => number;
}

/**
 * Pure verdict function. Returns `skip` for adopters, `stale` when src is
 * newer than dist or dist is missing, `fresh` otherwise.
 */
export function checkDevBuildStaleness(deps: DevCheckDeps): DevCheckResult {
  const newest = deps.newestSrc();
  if (newest === null) return { kind: "skip" };

  const distMtimeMs = deps.distMtimeMs();
  const now = deps.now();
  const srcAge = Math.max(0, Math.floor((now - newest.mtimeMs) / 1000));

  if (distMtimeMs === null) {
    return { kind: "stale", srcAge, distAge: null, newestSrc: newest.path };
  }

  if (newest.mtimeMs > distMtimeMs) {
    const distAge = Math.max(0, Math.floor((now - distMtimeMs) / 1000));
    return { kind: "stale", srcAge, distAge, newestSrc: newest.path };
  }

  return { kind: "fresh" };
}

/**
 * Build production-mode dependencies for the running `dist/cli.js` location.
 *
 * Walks `<pkg>/src/**\/*.ts` for the newest mtime and resolves
 * `dist/cli.js` mtime. Returns `null` for `newestSrc` when `src/` is absent
 * (the dev-mode discriminator).
 */
export function createDevCheckDeps(cliJsPath: string): DevCheckDeps {
  const distDir = dirname(cliJsPath);
  const pkgDir = dirname(distDir);
  const srcDir = join(pkgDir, "src");

  return {
    newestSrc: () => {
      if (!existsSync(srcDir)) return null;
      let newest: { mtimeMs: number; path: string } | null = null;
      walkTsFiles(srcDir, (file, mtimeMs) => {
        if (newest === null || mtimeMs > newest.mtimeMs) {
          newest = { mtimeMs, path: relative(pkgDir, file) };
        }
      });
      return newest;
    },
    distMtimeMs: () => {
      if (!existsSync(cliJsPath)) return null;
      return statSync(cliJsPath).mtimeMs;
    },
    now: () => Date.now(),
  };
}

function walkTsFiles(
  dir: string,
  visit: (file: string, mtimeMs: number) => void,
): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, visit);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      visit(full, statSync(full).mtimeMs);
    }
  }
}
