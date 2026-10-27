/** Concurrent editor-document publication through real filesystem operations. */
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { withAdvisoryLock } from "../../../src/lib/advisory-lock.js";
import { createGitExec } from "../../../src/lib/io-context.js";
import { createKernelRegistry } from "../../../src/lib/kernel/index.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import {
  nodeEditorDocumentsFs, writeEditorDocuments, type EditorDocumentsResult,
} from "../../../src/lib/schema-command/editor-documents.js";
import { createTempRepoCore, removeGitBackedDir } from "../../helpers/temp-repo.js";

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function registry() {
  const result = createKernelRegistry();
  result.register(z.strictObject({ count: z.number().int() }), {
    id: "editor", version: 1, migrationPosture: "strict-current", authored: "editor-document",
  });
  return result;
}

describe("concurrent checkout editor documents", () => {
  let root: string;
  const exec = createGitExec();
  beforeEach(async () => { root = await createTempRepoCore({ prefix: "arc-editor-concurrent-" }); });
  afterEach(async () => { await removeGitBackedDir(root); });

  it("lets two publishers finish when a contender arrives before the first writes its documents", async () => {
    const directory = resolveArcPath({ kind: "editor-document-root" });
    const document = `${directory}/editor.schema.json`;
    const contenderReached = signal();
    const resumeRemoval = signal();
    let contender: Promise<EditorDocumentsResult> | undefined;
    const contenderFs = {
      ...nodeEditorDocumentsFs,
      withLock: <T>(path: string, operation: () => Promise<T>) => withAdvisoryLock(path, operation, {
        onWait: contenderReached.resolve,
      }),
      rm: async (path: string, options: { recursive: boolean; force: boolean }) => {
        await rm(path, options);
        contenderReached.resolve();
        await resumeRemoval.promise;
      },
    };
    const firstFs = {
      ...nodeEditorDocumentsFs,
      mkdir: async (path: string, options: { recursive: boolean }) => {
        await nodeEditorDocumentsFs.mkdir(path, options);
        if (path !== join(root, directory) || contender !== undefined) return;
        contender = writeEditorDocuments(root, exec, contenderFs, registry());
        await Promise.race([contenderReached.promise, contender]);
      },
    };

    const first = await writeEditorDocuments(root, exec, firstFs, registry()).finally(resumeRemoval.resolve);
    expect(contender).toBeDefined();
    const second = await contender;
    expect([first, second]).toEqual([
      { ok: true, documents: [document] }, { ok: true, documents: [document] },
    ]);
    const schema = JSON.parse(await readFile(join(root, document), "utf8")) as { properties: unknown };
    expect(schema.properties).toMatchObject({ count: { type: "integer" } });
    expect(await readdir(join(root, directory))).toEqual(["editor.schema.json"]);
    expect((await exec("git", ["status", "--porcelain"], { cwd: root })).stdout).toBe("");
  });
});
