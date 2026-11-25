/** Filesystem witnesses for checkout editor-document provisioning. */
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { expect } from "vitest";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { git } from "./helpers.js";

async function excludePath(root: string): Promise<string> {
  const path = await git(root, ["rev-parse", "--git-path", "info/exclude"]);
  return isAbsolute(path) ? path : resolve(root, path);
}

/** Verify generated directory and clone-local ignore coverage. */
export async function assertEditorDocumentsProvisioned(root: string): Promise<void> {
  const directory = resolveArcPath({ kind: "editor-document-root" });
  expect((await stat(resolve(root, directory))).isDirectory()).toBe(true);
  const excludes = await readFile(await excludePath(root), "utf8");
  expect(excludes.split(/\r?\n/u)).toContain(`${directory}/`);
}

/** Remove earlier provisioning so the next command must establish both witnesses. */
export async function resetEditorDocumentsProvisioning(root: string): Promise<void> {
  const directory = resolveArcPath({ kind: "editor-document-root" });
  await rm(resolve(root, directory), { recursive: true, force: true });
  const path = await excludePath(root);
  const contents = await readFile(path, "utf8");
  await writeFile(path, contents.split(/\r?\n/u).filter((line) => line !== `${directory}/`).join("\n"));
}
