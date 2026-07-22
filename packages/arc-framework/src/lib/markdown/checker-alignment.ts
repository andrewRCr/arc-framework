/** Candidate/runtime byte alignment for staged Markdown checker implementation. */

import { Buffer } from "node:buffer";
import { join } from "node:path";

import { ArcError } from "../kernel/index.js";
import type { ReadIndexedBlob } from "./indexed-snapshot.js";
import { MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS } from "./staged-gate.js";

/** Inputs for proving the executing checker matches its indexed candidate. */
export interface AssertIndexedMarkdownCheckerAlignmentOptions {
  readonly root: string;
  readonly readBlob: ReadIndexedBlob;
  readonly readFile: (path: string) => Promise<Uint8Array>;
}

/** Refuse partial staging when the checker executing from the worktree differs from its indexed source. */
export async function assertIndexedMarkdownCheckerAlignment(
  options: AssertIndexedMarkdownCheckerAlignmentOptions,
): Promise<void> {
  for (const path of MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS) {
    const indexed = await options.readBlob(options.root, path);
    if (indexed === null) {
      throw new ArcError(`Indexed Markdown checker is missing: ${path}`, "markdown.checker-misaligned");
    }
    let runtime: Uint8Array;
    try {
      runtime = await options.readFile(join(options.root, ...path.split("/")));
    } catch (error) {
      throw new ArcError(`Runtime Markdown checker is unreadable: ${path}`, "markdown.checker-misaligned", {
        cause: error,
      });
    }
    if (!Buffer.from(indexed).equals(Buffer.from(runtime))) {
      throw new ArcError(
        `Indexed Markdown checker differs from executing worktree bytes: ${path}; stage or revert the checker change`,
        "markdown.checker-misaligned",
      );
    }
  }
}
