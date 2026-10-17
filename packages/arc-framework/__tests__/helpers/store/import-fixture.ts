/** Prepared checkout in the tracked substrates consumed by the one-time import. */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Command, Option } from "commander";
import { afterAll, onTestFinished } from "vitest";
import { createTempRepoCore, removeGitBackedDir } from "../temp-repo.js";
import { makeGitExec } from "../integration.js";
import { prepareRepositoryTemplate, copyPreparedRepository, PREPARED_REMOTE_PATH, type PreparedRepositoryTemplate } from "../prepared-repository.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { createDefaultRefStorePorts } from "../../../src/lib/store/default-ports.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { SlugSchema } from "../../../src/lib/kernel/schema/slug.js";
import { scanCommanderSource } from "../../../src/lib/command-input/source-scanner.js";
import { withInteractionContext } from "../../../src/lib/command-input/interaction-context.js";
import { handleStoreMigrate, type StoreMigrateOptions } from "../../../src/commands/store-migrate.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";
import type { StoreMigrateResult } from "../../../src/lib/store/commands.js";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { inRepoContent } from "./in-repo-fixture.js";
import { seedImportArchives } from "./import-archives.js";
import { seedImportLineage } from "./import-lineage.js";

export const IMPORT_DOCUMENTS = [
  ["work-item/task-list", "tasks", "# Task List: Alpha\n\n## **Phase 1:** Example\n\n### `[ ]` **1.1 Example**\n\n- _Goal:_ Finish the example.\n"],
  ["work-item/draft", "draft", "# Draft: Alpha\n\n**Purpose:** Explore the example.\n"],
  ["work-item/spec", "spec", "# Spec: Alpha\n\n**Purpose:** Define the example.\n"],
  ["work-item/notes", "notes", "# Notes: Alpha\n\nSource observations.\n"],
] as const;
export const IMPORT_COHORT = "# Cohort: `group`\n\n**Purpose:** Coordinate the example work.\n";
export const IMPORT_INBOX = "# Project Inbox\n\n## Inbox\n\n### **First**\n\n- _Description:_ First source entry.\n\n### **Second**\n\n- _Id:_ `11111111`\n- _Description:_ Second source entry.\n";

export interface ImportFixtureOptions { completed?: boolean; lineage?: boolean }
const templates = new Map<string, Promise<PreparedRepositoryTemplate>>();
afterAll(async () => { for (const template of templates.values()) await removeGitBackedDir((await template).root); });

async function build(completed: boolean, lineage: boolean): Promise<string> {
  const root = await createTempRepoCore({ prefix: "arc-import-", identity: "andrew" });
  const git = makeGitExec(root);
  const meta = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse("alpha"),
    placement: { kind: "active", scope: { kind: "project" } } });
  await mkdir(dirname(join(root, meta)), { recursive: true });
  await writeFile(join(root, meta), makeMetaFixture("alpha", { owner: "andrew", branch: "feat/alpha" }));
  const cohort = resolveArcPath({ kind: "cohort-document", cohort: [SlugSchema.parse("group")], placement: { kind: "planned" } });
  await mkdir(dirname(join(root, cohort)), { recursive: true });
  await writeFile(join(root, cohort), IMPORT_COHORT);
  for (const [, artifact, content] of IMPORT_DOCUMENTS) {
    const path = resolveArcPath({ kind: "work-unit-artifact", artifact, slug: SlugSchema.parse("alpha"),
      placement: { kind: "active", scope: { kind: "project" } } });
    await writeFile(join(root, path), content);
  }
  await writeFile(join(root, ".arc/active/extra-alpha.md"), "# Companion\n\nAdditional source.\n");
  await writeFile(join(root, resolveArcPath({ kind: "inbox", scope: { kind: "project" } })), IMPORT_INBOX);
  const candidate = resolveArcPath({ kind: "candidate-record", slug: SlugSchema.parse("alpha") });
  await mkdir(dirname(join(root, candidate)), { recursive: true });
  await writeFile(join(root, candidate), JSON.stringify(JSON.parse(inRepoContent(RecordReferenceSchema.parse({
    kind: "review/candidate", owner: { type: "work-item", name: "alpha" },
  }))), null, 2));
  await git("git", ["add", ".arc"]);
  await git("git", ["commit", "-m", "Seed tracked work"]);
  await git("git", ["branch", "feat/alpha"]);
  if (completed) await seedImportArchives(root, git);
  if (lineage) await seedImportLineage(root, git);
  const origin = join(root, PREPARED_REMOTE_PATH);
  await mkdir(dirname(origin), { recursive: true });
  await git("git", ["init", "--bare", "--initial-branch=main", origin]);
  await git("git", ["remote", "add", "origin", origin]);
  return root;
}

/** Copy the prepared source without precreating either the store or review-gate identity. */
export async function importFixture(layout: "default" | "separate" = "default", options: ImportFixtureOptions = {}) {
  const completed = options.completed === true, lineage = options.lineage === true;
  const key = `tracked-import${completed ? "-archives" : ""}${lineage ? "-lineage" : ""}`;
  const shape = { kind: "remote-bearing", key } as const;
  let template = templates.get(key);
  if (!template) { template = prepareRepositoryTemplate(shape, () => build(completed, lineage)); templates.set(key, template); }
  const root = await copyPreparedRepository(await template, shape);
  onTestFinished(() => removeGitBackedDir(root));
  const git = makeGitExec(root);
  await git("git", ["config", "remote.origin.arc-state", layout === "default" ? "push" : "off"]);
  const ports = createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null });
  const origin = join(root, PREPARED_REMOTE_PATH);
  return { root, git, ports, origin, remote: makeGitExec(origin), migrate: (trial = false) => invokeImport(ports, trial) };
}

async function invokeImport(ports: RefStorePorts, trial: boolean): Promise<StoreMigrateResult> {
  const sourceText = await readFile(resolve(import.meta.dirname, "../../../src/cli.ts"), "utf8");
  const syntax = scanCommanderSource({ file: "cli.ts", sourceText }).commands.find(({ path }) => path === "store migrate");
  if (!syntax) throw new Error("The production migration command is absent");
  const command = new Command("migrate").exitOverride();
  for (const option of syntax.options) command.addOption(new Option(option.flags).default(option.defaultValue));
  let result: StoreMigrateResult | undefined;
  command.action(withInteractionContext({ machineReadable: () => true,
    environment: { ci: false, promptInputIsTTY: false, promptOutputIsTTY: false } },
  async (context, options: StoreMigrateOptions) => {
    result = await handleStoreMigrate(options, context, { ports, write: () => {}, setExitCode: () => {} });
  }));
  await command.parseAsync(["--import", "--json", ...(trial ? ["--trial"] : [])], { from: "user" });
  if (!result) throw new Error("The migration handler produced no result");
  return result;
}
