/** Editor-document publication through real files and Git exclusion. */
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createKernelRegistry } from "../../../src/lib/kernel/index.js";
import { createGitExec } from "../../../src/lib/io-context.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import {
  EditorDocumentsWriteError, nodeEditorDocumentsFs, writeEditorDocuments, writeEditorDocumentsOrThrow,
  type EditorDocumentsFs, type EditorDocumentsWriter,
} from "../../../src/lib/schema-command/editor-documents.js";
import { createTempRepoCore, removeGitBackedDir } from "../../helpers/temp-repo.js";

const documentPath = ".arc/system/.internal/schemas/editor.schema.json";
const directoryPath = resolveArcPath({ kind: "editor-document-root" });
function registry(marked = true) {
  const result = createKernelRegistry();
  const item = z.strictObject({ count: z.number().int().default(1), enabled: z.boolean() });
  result.register(z.strictObject({ first: item, second: item, $schema: z.string().optional() }), {
    id: "editor", version: 1, migrationPosture: "strict-current", ...(marked ? { authored: "editor-document" as const } : {}),
  });
  return result;
}

describe("checkout editor documents", () => {
  let root: string;
  const exec = createGitExec();
  beforeEach(async () => { root = await createTempRepoCore({ prefix: "arc-editor-documents-" }); });
  afterEach(async () => { await removeGitBackedDir(root); });

  it("writes only marked self-contained input documents ignored by real Git", async () => {
    const result = await writeEditorDocuments(root, exec, nodeEditorDocumentsFs, registry());
    expect(result).toEqual({ ok: true, documents: [documentPath] });
    const document = JSON.parse(await readFile(join(root, documentPath), "utf8")) as AnySchema;
    const validator = new Ajv2020({ strict: true, allErrors: true }).compile(document);
    expect(validator({ first: { enabled: true }, second: { count: 2, enabled: false } })).toBe(true);
    expect(validator({ first: { count: "1", enabled: true }, second: { count: 2, enabled: false } })).toBe(false);
    expect(await readdir(join(root, directoryPath))).toEqual(["editor.schema.json"]);
    expect((await exec("git", ["check-ignore", documentPath], { cwd: root })).stdout).toBe(documentPath);
    expect((await exec("git", ["status", "--porcelain"], { cwd: root })).stdout).toBe("");
  });

  it("clears documents whose registration loses its marker", async () => {
    expect(await writeEditorDocuments(root, exec, nodeEditorDocumentsFs, registry())).toEqual({
      ok: true, documents: [documentPath],
    });
    expect(await writeEditorDocuments(root, exec, nodeEditorDocumentsFs, registry(false)))
      .toEqual({ ok: true, documents: [] });
    expect(await readdir(join(root, directoryPath))).toEqual([]);
  });

  it("leaves an excluded empty directory without projecting unmarked contracts", async () => {
    const opaque = createKernelRegistry();
    opaque.register(z.custom(), { id: "opaque", version: 1, migrationPosture: "strict-current" });
    expect(await writeEditorDocuments(root, exec, nodeEditorDocumentsFs, opaque)).toEqual({ ok: true, documents: [] });
    expect(await readdir(join(root, directoryPath))).toEqual([]);
    expect(await readFile(join(root, ".git/info/exclude"), "utf8")).toContain(`${directoryPath}/\n`);
  });

  it("preserves local excludes and writes its entry once before document publication", async () => {
    const exclude = join(root, ".git/info/exclude");
    await writeFile(exclude, "# local\r\nkeep-me");
    const observedFs: EditorDocumentsFs = { ...nodeEditorDocumentsFs,
      writeFile: async (path, content) => {
        if (path.endsWith(".schema.json")) {
          const ignored = await readFile(exclude, "utf8");
          if (!ignored.split(/\r?\n/u).includes(`${directoryPath}/`)) throw new Error("Document would be unignored");
        }
        await writeFile(path, content);
      },
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await writeEditorDocuments(root, exec, observedFs, registry())).toEqual({ ok: true, documents: [documentPath] });
    }
    expect(await readFile(exclude, "utf8")).toBe(`# local\r\nkeep-me\n${directoryPath}/\n`);
  });

  it.each(["remove", "mkdir", "write"])("reports the absolute document path on a %s failure", async (operation) => {
    const failure = new Error(`${operation} denied`);
    const fs: EditorDocumentsFs = { ...nodeEditorDocumentsFs,
      rm: async (path, options) => { if (operation === "remove") throw failure; await nodeEditorDocumentsFs.rm(path, options); },
      mkdir: async (path, options) => {
        if (operation === "mkdir" && path === join(root, directoryPath)) throw failure;
        await nodeEditorDocumentsFs.mkdir(path, options);
      },
      writeFile: async (path, content) => {
        if (operation === "write" && path.endsWith(".schema.json")) throw failure;
        await writeFile(path, content);
      },
    };
    expect(await writeEditorDocuments(root, exec, fs, registry())).toEqual({ ok: false, target: "documents",
      path: join(root, operation === "write" ? documentPath : directoryPath), detail: `${operation} denied` });
  });

  it.each(["read", "mkdir", "write"])("reports the resolved exclude path on a %s failure without writing documents", async (operation) => {
    const exclude = join(root, ".git/info/exclude");
    const fs: EditorDocumentsFs = { ...nodeEditorDocumentsFs,
      readFile: async (path) => { if (operation === "read") throw new Error("exclude denied"); return readFile(path, "utf8"); },
      mkdir: async (path, options) => { if (operation === "mkdir") throw new Error("exclude denied"); await mkdir(path, options); },
      writeFile: async (path, content) => { if (operation === "write") throw new Error("exclude denied"); await writeFile(path, content); },
    };
    expect(await writeEditorDocuments(root, exec, fs, registry())).toEqual({
      ok: false, target: "exclude", path: exclude, detail: "exclude denied",
    });
    await expect(access(join(root, directoryPath))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns no path when Git cannot resolve the exclude file", async () => {
    const failedGit: GitExec = async () => { throw new Error("Git unavailable"); };
    expect(await writeEditorDocuments(root, failedGit, nodeEditorDocumentsFs, registry())).toEqual({
      ok: false, target: "exclude", detail: "Git unavailable",
    });
    await expect(access(join(root, directoryPath))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the clone's absolute exclude path outside a linked checkout", async () => {
    await exec("git", ["commit", "--allow-empty", "-m", "seed"], { cwd: root });
    const linked = join(root, "linked");
    await exec("git", ["worktree", "add", "-b", "linked", linked], { cwd: root });
    const fs: EditorDocumentsFs = { ...nodeEditorDocumentsFs, readFile: async () => { throw new Error("denied"); } };
    expect(await writeEditorDocuments(linked, exec, fs, registry())).toEqual({
      ok: false, target: "exclude", path: join(root, ".git/info/exclude"), detail: "denied",
    });
  });

  it("lets projection defects throw through the ordinary error path", async () => {
    const invalid = createKernelRegistry();
    invalid.register(z.custom(), { id: "opaque", version: 1, migrationPosture: "strict-current", authored: "editor-document" });
    await expect(writeEditorDocuments(root, exec, nodeEditorDocumentsFs, invalid)).rejects.toThrow();
  });

  it("throws the injected writer's typed failure and returns its successful paths", async () => {
    const failure = { target: "exclude" as const, path: join(root, ".git/info/exclude"), detail: "denied" };
    const failedWriter: EditorDocumentsWriter = async () => ({ ok: false, ...failure });
    const thrown = await writeEditorDocumentsOrThrow(root, exec, nodeEditorDocumentsFs, undefined, failedWriter)
      .catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(EditorDocumentsWriteError);
    expect(thrown).toMatchObject({ failure, message: failure.detail });
    const successfulWriter: EditorDocumentsWriter = async () => ({ ok: true, documents: [documentPath] });
    expect(await writeEditorDocumentsOrThrow(root, exec, nodeEditorDocumentsFs, undefined, successfulWriter))
      .toEqual([documentPath]);
  });
});
