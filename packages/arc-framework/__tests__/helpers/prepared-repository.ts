/** Prepared integration-repository templates and independent per-test copies. */

import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { removeGitBackedDir } from "./temp-repo.js";

export type PreparedRepositoryKind = "plain" | "remote-bearing" | "worktree-bearing";

/** Stable identity for one compatible prepared-repository shape. */
export interface PreparedRepositoryShape {
  readonly kind: PreparedRepositoryKind;
  readonly key: string;
}

/** One built repository template that can serve compatible test copies. */
export interface PreparedRepositoryTemplate {
  readonly root: string;
  readonly shape: PreparedRepositoryShape;
}

/**
 * Build one repository template for reuse by compatible tests.
 *
 * @param shape - Exact fixture shape served by the template.
 * @param build - Builder that creates the template repository once.
 * @returns The built template and its immutable shape identity.
 */
export async function prepareRepositoryTemplate(
  shape: PreparedRepositoryShape,
  build: () => Promise<string>,
): Promise<PreparedRepositoryTemplate> {
  return { root: await build(), shape };
}

/**
 * Copy one prepared repository for an individual test.
 *
 * @param template - Prepared repository to copy.
 * @param shape - Exact shape requested by the test.
 * @returns A new independently writable repository path.
 */
export async function copyPreparedRepository(
  template: PreparedRepositoryTemplate,
  shape: PreparedRepositoryShape,
): Promise<string> {
  if (template.shape.kind !== shape.kind || template.shape.key !== shape.key) {
    throw new Error(
      `Prepared repository shape mismatch: template is ${template.shape.kind}/${template.shape.key}, `
      + `request is ${shape.kind}/${shape.key}`,
    );
  }
  const destination = await mkdtemp(join(tmpdir(), "arc-prepared-copy-"));
  await rm(destination, { recursive: true, force: true });
  try {
    await cp(template.root, destination, { recursive: true });
    return destination;
  } catch (error) {
    await removeGitBackedDir(destination);
    throw error;
  }
}
