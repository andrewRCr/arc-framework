/** Local filesystem adapter for review method declarations. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ReviewMethodFilePort } from "../../policy/activity.js";

/** Bind review method lookup to the current project's managed method directory. */
export function createLocalReviewMethodFilePort(input: {
  cwd: string;
  readFile?: (path: string) => string;
}): ReviewMethodFilePort {
  const readFile = input.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  return {
    readMethodFile(name): unknown {
      return readFile(join(input.cwd, ".arc", "system", "methods", `${name}.md`));
    },
  };
}
