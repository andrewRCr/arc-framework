/**
 * Read-only local commit-object availability.
 *
 * @module
 */

import type { GitExecInput } from "./exec.js";
import { isGitObjectId } from "./object-id.js";

/** Complete per-OID commit availability, or an unavailable local probe. */
export type ObjectAvailabilityResult =
  | { kind: "complete"; commits: Record<string, boolean> }
  | { kind: "unavailable"; reason: "execution" | "malformed" };

/** Inputs for {@link readObjectAvailability}. */
export interface ReadObjectAvailabilityOptions {
  /** Stdin-fed Git executor. */
  execInput: GitExecInput;
  /** Advertised object IDs whose local commit availability is required. */
  oids: readonly string[];
  /** Repository root, when ambient process state must not select the repository. */
  cwd?: string;
}

/** Inspect local commit-object availability in one non-materializing batch. */
export async function readObjectAvailability(
  options: ReadObjectAvailabilityOptions,
): Promise<ObjectAvailabilityResult> {
  const uniqueOids = [...new Set(options.oids)];
  if (uniqueOids.some((oid) => !isGitObjectId(oid))) {
    return { kind: "unavailable", reason: "malformed" };
  }
  if (uniqueOids.length === 0) return { kind: "complete", commits: {} };

  let stdout: string;
  try {
    stdout = await options.execInput(
      ["cat-file", "--batch-check"],
      `${uniqueOids.join("\n")}\n`,
      { cwd: options.cwd, objectAccess: "local-only" },
    );
  } catch {
    return { kind: "unavailable", reason: "execution" };
  }

  const lines = stdout.endsWith("\n") ? stdout.slice(0, -1).split("\n") : stdout.split("\n");
  if (lines.length !== uniqueOids.length) return { kind: "unavailable", reason: "malformed" };

  const commits: Record<string, boolean> = {};
  for (const [index, expectedOid] of uniqueOids.entries()) {
    const fields = lines[index]?.split(" ") ?? [];
    if (fields[0] !== expectedOid) {
      return { kind: "unavailable", reason: "malformed" };
    }
    if (fields.length === 2 && fields[1] === "missing") {
      commits[expectedOid] = false;
      continue;
    }
    if (
      fields.length !== 3
      || !["blob", "commit", "tag", "tree"].includes(fields[1] ?? "")
      || !/^\d+$/u.test(fields[2] ?? "")
    ) {
      return { kind: "unavailable", reason: "malformed" };
    }
    commits[expectedOid] = fields[1] === "commit";
  }
  return { kind: "complete", commits };
}
