/** Contained conversion from canonical managed paths to native filesystem paths. */

import { posix, win32 } from "node:path";

import { validateManagedPath, type ManagedPath } from "../kernel/index.js";
import { LayoutError } from "./errors.js";

interface PathSemantics {
  readonly sep: string;
  isAbsolute(path: string): boolean;
  normalize(path: string): string;
  relative(from: string, to: string): string;
  resolve(...paths: string[]): string;
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function hasDotSegment(root: string, windows: boolean): boolean {
  const segments = windows ? root.split(/[\\/]+/u) : root.split("/");
  return segments.some((segment) => segment === "." || segment === "..");
}

function isQualifiedWindowsRoot(root: string): boolean {
  if (/^\\\\[?.]\\/u.test(root)) return false;
  const driveQualified = /^[A-Za-z]:[\\/]/u.test(root);
  const uncQualified = /^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/].*)?$/u.test(root);
  return driveQualified || uncQualified;
}

function validateRoot(root: string, semantics: PathSemantics, windows: boolean): string {
  if (typeof root !== "string") {
    throw new LayoutError("Invalid materialization root", "layout.invalid-materialization-root");
  }
  const qualified = windows
    ? isQualifiedWindowsRoot(root)
    : root.startsWith("/") && semantics.isAbsolute(root);
  if (
    root.length === 0
    || root.includes("\0")
    || !isWellFormedUnicode(root)
    || root.normalize("NFC") !== root
    || !qualified
    || hasDotSegment(root, windows)
  ) {
    throw new LayoutError("Invalid materialization root", "layout.invalid-materialization-root");
  }
  return semantics.normalize(root);
}

/**
 * Materialize with explicit path semantics for deterministic cross-platform tests.
 * This helper is intentionally omitted from the public layout barrel.
 *
 * @param semantics - POSIX or Windows host path implementation
 * @param root - Fully qualified caller-selected native root
 * @param managedPath - Canonical repository-relative managed path
 * @returns A native path proven to be a strict descendant of root
 */
export function materializeArcPathWithSemantics(
  semantics: PathSemantics,
  root: string,
  managedPath: ManagedPath,
): string {
  const windows = semantics === win32;
  const normalizedRoot = validateRoot(root, semantics, windows);
  let validatedPath: ManagedPath;
  try {
    validatedPath = validateManagedPath(managedPath);
  } catch (error) {
    throw new LayoutError("Invalid managed path for materialization", "layout.invalid-managed-path", {
      cause: error,
    });
  }

  const segments = validatedPath.split("/");
  if (windows && segments.some((segment) => /^[A-Za-z]:/u.test(segment))) {
    throw new LayoutError("Managed path contains a Windows drive designator", "layout.invalid-managed-path");
  }

  const result = semantics.resolve(normalizedRoot, ...segments);
  const descendant = semantics.relative(normalizedRoot, result);
  if (
    descendant.length === 0
    || semantics.isAbsolute(descendant)
    || descendant === ".."
    || descendant.startsWith(`..${semantics.sep}`)
  ) {
    throw new LayoutError("Materialized path escapes its selected root", "layout.invalid-managed-path");
  }
  return result;
}

/**
 * Materialize a canonical path beneath an explicit root using host semantics.
 *
 * @param root - Fully qualified caller-selected native root
 * @param managedPath - Canonical repository-relative managed path
 * @returns A native path proven to be a strict descendant of root
 */
export function materializeArcPath(root: string, managedPath: ManagedPath): string {
  return materializeArcPathWithSemantics(process.platform === "win32" ? win32 : posix, root, managedPath);
}
