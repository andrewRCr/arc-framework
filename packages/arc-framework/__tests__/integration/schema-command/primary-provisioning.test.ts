/** Primary command failures use the production writer's throwing policy. */
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { runInit, type IOContext } from "../../../src/commands/init.js";
import { runUpdate } from "../../../src/commands/update.js";
import { runJoin } from "../../../src/commands/join.js";
import { EditorDocumentsWriteError } from "../../../src/lib/schema-command/editor-documents.js";
import {
  createTempRepo, cleanupTempDir, makeIOContext, loadRecipe, DEFAULT_PROMPTS,
  getArcTemplatePath, getInternalTemplatePath,
} from "../../helpers/integration.js";

async function initialize(root: string, io: IOContext) {
  return runInit({ cwd: root, io, templateDir: getArcTemplatePath(), internalTemplateDir: getInternalTemplatePath(),
    recipe: await loadRecipe(), prompts: DEFAULT_PROMPTS, identityResult: "test-user" });
}

describe("primary editor-document provisioning failures", () => {
  let root: string;
  beforeEach(async () => { root = await createTempRepo("arc-primary-documents-"); });
  afterEach(async () => { await cleanupTempDir(root); });

  it.each(["init", "update", "join"] as const)("fails %s on the writer's typed error", async (command) => {
    const io = makeIOContext(root);
    io.writeEditorDocuments = async () => ({ ok: true, documents: [] });
    if (command !== "init") await initialize(root, io);
    const failure = { target: "documents" as const, path: `${root}/blocked`, detail: "editor documents denied" };
    io.writeEditorDocuments = async () => ({ ok: false, ...failure });
    let operation: Promise<unknown>;
    if (command === "init") operation = initialize(root, io);
    else if (command === "update") operation = runUpdate({ cwd: root, io, templateDir: getArcTemplatePath(), recipe: await loadRecipe() });
    else operation = runJoin({ cwd: root, io, templateDir: getArcTemplatePath(), internalTemplateDir: getInternalTemplatePath(),
      prompts: { role: "maintainer", tools: [] }, identityResult: "test-user" });
    await expect(operation).rejects.toBeInstanceOf(EditorDocumentsWriteError);
    await expect(operation).rejects.toMatchObject({ failure, message: failure.detail });
  });
});
