/** Locate and validate project-authored structured configuration files. */

import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import yaml from "js-yaml";
import type { z } from "zod";

import { materializeArcPath, resolveArcPath } from "../layout/index.js";

const STRUCTURED_FILE_SUFFIXES = {
  "check-declaration": "system/arc-checks.yml",
} as const;

export type StructuredFileIdentity = keyof typeof STRUCTURED_FILE_SUFFIXES;

export type TypedFileResult<T> =
  | { readonly status: "valid"; readonly location: string; readonly value: T }
  | { readonly status: "absent"; readonly location: string }
  | { readonly status: "invalid"; readonly location: string; readonly message: string };

/**
 * Read a structured project file through the configuration location boundary.
 *
 * @param root - Absolute repository root
 * @param identity - Configuration file identity
 * @param schema - The file's exported runtime schema
 * @returns Validated data and location, absence, or an actionable diagnostic
 */
export async function readTypedProjectFile<T>(
  root: string,
  identity: StructuredFileIdentity,
  schema: z.ZodType<T>,
): Promise<TypedFileResult<T>> {
  const arcRoot = resolveArcPath({ kind: "arc-root" });
  const suffix = STRUCTURED_FILE_SUFFIXES[identity];
  const location = posix.join(arcRoot, suffix);
  let content: string;
  try {
    content = await readFile(join(materializeArcPath(root, arcRoot), ...suffix.split("/")), "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return { status: "absent", location };
    }
    return { status: "invalid", location, message: error instanceof Error ? error.message : String(error) };
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (error) {
    return { status: "invalid", location, message: error instanceof Error ? error.message : String(error) };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const message = result.error.issues.map((issue) =>
      `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`
    ).join("; ");
    return { status: "invalid", location, message };
  }
  return { status: "valid", location, value: result.data };
}
