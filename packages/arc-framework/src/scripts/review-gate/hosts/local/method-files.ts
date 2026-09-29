/** Local filesystem adapter for review method declarations. */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { materializeArcPath, resolveArcPath } from "../../../../lib/layout/index.js";
import type { ReviewMethodFilePort } from "../../policy/activity.js";
import {
  bindReviewRubricMethodLookup,
  type ReviewRubricBindingPort,
} from "../../policy/rubric-binding.js";

/** Bind review method lookup to the current project's managed method directory. */
export function createLocalReviewMethodFilePort(input: {
  cwd: string;
  readFile?: (path: string) => string;
}): ReviewMethodFilePort {
  const readFile = input.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const directory = materializeArcPath(input.cwd, resolveArcPath({ kind: "procedure-root", family: "methods" }));
  return {
    readMethodFile(name): unknown {
      return readFile(join(directory, `${name}.md`));
    },
  };
}

/** Bind exact rubric-identity lookup to the current project's managed method directory. */
export function createLocalReviewRubricBindingPort(input: {
  cwd: string;
  readDirectory?: (path: string) => readonly string[];
  readFile?: (path: string) => string;
}): ReviewRubricBindingPort {
  const directory = materializeArcPath(input.cwd, resolveArcPath({ kind: "procedure-root", family: "methods" }));
  const readDirectory = input.readDirectory ?? ((path: string) => readdirSync(path));
  const readFile = input.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  return bindReviewRubricMethodLookup({
    lookupMethodFiles(identity): readonly unknown[] {
      return readDirectory(directory)
        .filter((filename) => filename === `${identity}.md`)
        .map((filename) => readFile(join(directory, filename)));
    },
  });
}
