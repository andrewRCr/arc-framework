/** Prepared checkout in the tracked substrates consumed by the one-time import. */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Command, Option } from "commander";
import { afterAll, onTestFinished } from "vitest";
import { createTempRepoCore, removeGitBackedDir } from "../temp-repo.js";
import { makeGitExec } from "../integration.js";
import { prepareRepositoryTemplate, copyPreparedRepository, type PreparedRepositoryTemplate } from "../prepared-repository.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { createDefaultRefStorePorts } from "../../../src/lib/store/default-ports.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { SlugSchema } from "../../../src/lib/kernel/schema/slug.js";
import { scanCommanderSource } from "../../../src/lib/command-input/source-scanner.js";
import { withInteractionContext } from "../../../src/lib/command-input/interaction-context.js";
import { handleStoreMigrate, type StoreMigrateOptions } from "../../../src/commands/store-migrate.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";
import type { StoreMigrateResult } from "../../../src/lib/store/commands.js";

const shape = { kind: "plain", key: "tracked-import" } as const;
let template: Promise<PreparedRepositoryTemplate> | undefined;
afterAll(async () => { if (template) await removeGitBackedDir((await template).root); });

async function build(): Promise<string> {
  const root = await createTempRepoCore({ prefix: "arc-import-", identity: "andrew" });
  const git = makeGitExec(root);
  const meta = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse("alpha"),
    placement: { kind: "active", scope: { kind: "project" } } });
  await mkdir(dirname(join(root, meta)), { recursive: true });
  await writeFile(join(root, meta), makeMetaFixture("alpha", { owner: "andrew", branch: "feat/alpha" }));
  const cohort = resolveArcPath({ kind: "cohort-document", cohort: [SlugSchema.parse("group")], placement: { kind: "planned" } });
  await mkdir(dirname(join(root, cohort)), { recursive: true });
  await writeFile(join(root, cohort), "# Cohort: `group`\n\n**Purpose:** Coordinate the example work.\n");
  await git("git", ["add", ".arc"]);
  await git("git", ["commit", "-m", "Seed tracked work"]);
  await git("git", ["branch", "feat/alpha"]);
  return root;
}

/** Copy the prepared source without precreating either the store or review-gate identity. */
export async function importFixture(layout: "default" | "separate" = "default") {
  template ??= prepareRepositoryTemplate(shape, build);
  const root = await copyPreparedRepository(await template, shape);
  onTestFinished(() => removeGitBackedDir(root));
  const git = makeGitExec(root);
  await git("git", ["remote", "add", "origin", "."]);
  await git("git", ["config", "remote.origin.arc-state", layout === "default" ? "push" : "off"]);
  const ports = createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null });
  return { root, git, ports, migrate: (trial = false) => invokeImport(ports, trial) };
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
