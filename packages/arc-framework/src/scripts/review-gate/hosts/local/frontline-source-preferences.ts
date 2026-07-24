/** Machine-local adapter for developer and project frontline source preferences. */

import { join } from "node:path";

import { ARC_CONFIG_SUFFIX } from "../../../../lib/constants.js";
import { parseArcConfig } from "../../../../lib/config/index.js";
import type { GitExec } from "../../../../lib/git/index.js";
import { materializeArcPath, resolveArcPath } from "../../../../lib/layout/index.js";
import type { FrontlineSourcePreferenceReader } from "../../policy/frontline-source.js";

export const FRONTLINE_SOURCE_GIT_CONFIG_KEY = "arc.frontlineSources";
export const FRONTLINE_SOURCE_YAML_KEY = "review.frontline_sources";

function parseSourceIds(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === "") return [];
  const trimmed = value.trim();
  const startsList = trimmed.startsWith("[");
  const endsList = trimmed.endsWith("]");
  if (startsList !== endsList) throw new Error("frontline source list must use matched brackets");
  const list = startsList ? trimmed.slice(1, -1) : trimmed;
  if (list.trim() === "") return [];
  return list.split(",").map((sourceId) => sourceId.trim()).filter((sourceId) => sourceId !== "");
}

/** Bind the provider-neutral preference port to local git config and tracked ARC config. */
export function createLocalFrontlineSourcePreferenceReader(input: {
  cwd: string;
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
}): FrontlineSourcePreferenceReader {
  return {
    async readDeveloperSourceIds(): Promise<readonly string[]> {
      try {
        const result = await input.exec("git", ["config", "--get-all", FRONTLINE_SOURCE_GIT_CONFIG_KEY]);
        return result.stdout.split(/\r?\n/u).flatMap((value) => parseSourceIds(value));
      } catch {
        return [];
      }
    },
    async readProjectSourceIds(): Promise<readonly string[]> {
      try {
        const arcRoot = materializeArcPath(input.cwd, resolveArcPath({ kind: "arc-root" }));
        const path = join(arcRoot, ...ARC_CONFIG_SUFFIX);
        const value = parseArcConfig(await input.readFile(path))[FRONTLINE_SOURCE_YAML_KEY];
        return parseSourceIds(value);
      } catch {
        return [];
      }
    },
  };
}
