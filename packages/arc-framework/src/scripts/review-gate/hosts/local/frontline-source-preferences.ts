/** Machine-local adapter for developer and project frontline source preferences. */

import { join } from "node:path";

import { ARC_CONFIG_SUFFIX } from "../../../../lib/constants.js";
import { parseArcConfig } from "../../../../lib/config/index.js";
import { gitConfigGet, type GitExec } from "../../../../lib/git/index.js";
import { materializeArcPath, resolveArcPath } from "../../../../lib/layout/index.js";
import type { FrontlineSourcePreferenceReader } from "../../policy/frontline-source.js";

export const FRONTLINE_SOURCE_GIT_CONFIG_KEY = "arc.frontlineSource";
export const FRONTLINE_SOURCE_YAML_KEY = "review.frontline_source";

/** Bind the provider-neutral preference port to local git config and tracked ARC config. */
export function createLocalFrontlineSourcePreferenceReader(input: {
  cwd: string;
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
}): FrontlineSourcePreferenceReader {
  return {
    async readDeveloperSourceId(): Promise<string | null> {
      const value = await gitConfigGet(input.exec, FRONTLINE_SOURCE_GIT_CONFIG_KEY);
      return value === undefined || value === "" ? null : value;
    },
    async readProjectSourceId(): Promise<string | null> {
      try {
        const arcRoot = materializeArcPath(input.cwd, resolveArcPath({ kind: "arc-root" }));
        const path = join(arcRoot, ...ARC_CONFIG_SUFFIX);
        const value = parseArcConfig(await input.readFile(path))[FRONTLINE_SOURCE_YAML_KEY];
        return value === undefined || value === "" ? null : value;
      } catch {
        return null;
      }
    },
  };
}
