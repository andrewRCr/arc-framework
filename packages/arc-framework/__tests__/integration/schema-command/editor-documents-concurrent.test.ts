/** Concurrent editor-document publication through real filesystem operations. */
import { open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { withAdvisoryLock } from "../../../src/lib/advisory-lock.js";
import { createGitExec } from "../../../src/lib/io-context.js";
import { createKernelRegistry } from "../../../src/lib/kernel/index.js";
import { ensureWorktreeMarkerIgnored } from "../../../src/lib/git/worktree-marker.js";
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

  it.each([
    { name: "another publisher in the same checkout", linked: false, marker: false },
    { name: "another publisher in a linked worktree", linked: true, marker: false },
    { name: "marker registration in the same checkout", linked: false, marker: true },
    { name: "marker registration in a linked worktree", linked: true, marker: true },
  ])("retains local ignore rules while racing $name", async ({ linked, marker }) => {
    const contenderRoot = linked ? join(root, "linked") : root;
    if (linked) {
      await exec("git", ["-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", "seed"], { cwd: root });
      await exec("git", ["worktree", "add", "-b", "linked", contenderRoot], { cwd: root });
    }
    const directory = resolveArcPath({ kind: "editor-document-root" });
    const markerPattern = ".arc/system/.internal/worktree-marker.json";
    const exclude = resolve(root, (await exec("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root })).stdout);
    const original = "# local excludes\nkeep-me\n";
    await writeFile(exclude, original);
    const contenderReached = signal();
    const resumeContender = signal();
    let contender: Promise<EditorDocumentsResult | undefined> | undefined;
    const contenderFs = {
      ...nodeEditorDocumentsFs,
      withLock: <T>(path: string, operation: () => Promise<T>) => withAdvisoryLock(path, operation, {
        onWait: contenderReached.resolve,
      }),
      writeFile: async (path: string, content: string) => {
        if (path === exclude) {
          contenderReached.resolve();
          await resumeContender.promise;
        }
        await writeFile(path, content);
      },
    };
    const firstFs = {
      ...nodeEditorDocumentsFs,
      writeFile: async (path: string, content: string) => {
        if (path !== exclude) { await writeFile(path, content); return; }
        const file = await open(path, "w");
        try {
          contender = marker
            ? ensureWorktreeMarkerIgnored(contenderRoot, exec, contenderFs).then(() => undefined)
            : writeEditorDocuments(contenderRoot, exec, contenderFs, registry());
          await Promise.race([contenderReached.promise, contender]);
          await file.writeFile(content);
        } finally { await file.close(); }
      },
    };

    const first = await writeEditorDocuments(root, exec, firstFs, registry()).finally(resumeContender.resolve);
    expect(contender).toBeDefined();
    const second = await contender;
    expect(first).toEqual({ ok: true, documents: [`${directory}/editor.schema.json`] });
    expect(second).toEqual(marker ? undefined : { ok: true, documents: [`${directory}/editor.schema.json`] });
    expect(await readFile(exclude, "utf8")).toBe(`${original}${directory}/\n${marker ? `${markerPattern}\n` : ""}`);
    expect((await exec("git", ["check-ignore", `${directory}/editor.schema.json`], { cwd: root })).stdout)
      .toBe(`${directory}/editor.schema.json`);
    if (marker) expect((await exec("git", ["check-ignore", markerPattern], { cwd: contenderRoot })).stdout).toBe(markerPattern);
  });
});
