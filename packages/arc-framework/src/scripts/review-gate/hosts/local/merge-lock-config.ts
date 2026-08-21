/**
 * Strict `merge.lock` read against a caller-supplied tree root.
 *
 * The shared settings reader is deliberately fail-soft — it degrades an
 * unreadable config to a warning and substitutes documented defaults — which
 * for this key would resolve to the value that disables the control. This
 * reader keeps the three outcomes apart so the lock can fail closed.
 *
 * @module
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ARC_CONFIG_SUFFIX } from "../../../../lib/constants.js";
import { parseArcConfig } from "../../../../lib/config/index.js";
import { materializeArcPath, resolveArcPath } from "../../../../lib/layout/index.js";
import type { MergeLockSetting } from "../../merge-lock.js";

/**
 * Read `merge.lock` from the config under one tree root.
 *
 * @param treeRoot - Absolute root of the candidate tree to resolve against.
 * @returns The key's value, its documented absence, or an unreadable config.
 */
export async function readMergeLockSetting(treeRoot: string): Promise<MergeLockSetting> {
  const configPath = join(materializeArcPath(treeRoot, resolveArcPath({ kind: "arc-root" })), ...ARC_CONFIG_SUFFIX);
  let raw: Record<string, string>;
  try {
    raw = parseArcConfig(await readFile(configPath, "utf8"));
  } catch {
    return { state: "unreadable" };
  }
  const value = raw["merge.lock"];
  return value === undefined ? { state: "absent" } : { state: "value", value };
}
