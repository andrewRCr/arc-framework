/** Repository-owned command-input declaration projection and inventory rendering. */

import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type { CommandInputDeclaration } from "./declaration.js";
import type { CommandInputRegistration } from "./registry.js";
import { reconcileCommandInputInventory, type CommandInputInventory } from "./inventory.js";
import {
  scanCommandInputSources,
  type DiscoveredCommand,
  type DiscoveredInteractionSite,
} from "./source-scanner.js";

const INTERACTION_OWNERS: Readonly<Record<string, string>> = Object.freeze({
  "handlers/check/commit-msg-cli.ts|explicit-stdin|process.stdin|1": "check commit-msg",
  "handlers/installation.ts|subprocess|execa|1": "update",
  "handlers/lifecycle.ts|prompt|p.select|1": "stub",
  "handlers/lifecycle.ts|prompt|p.select|2": "stub",
  "handlers/lifecycle.ts|prompt|p.select|3": "promote",
  "handlers/release/commit-cli.ts|explicit-stdin|process.stdin|1": "release commit",
  "handlers/release/commit-cli.ts|subprocess|execa|1": "release commit",
  "handlers/release/setup/install.ts|prompt|p.text|1": "release setup install",
  "handlers/release/setup/install.ts|prompt|p.select|1": "release setup install",
  "handlers/release/setup/install.ts|prompt|p.select|2": "release setup install",
  "handlers/release/setup/install.ts|prompt|p.confirm|1": "release setup install",
  "handlers/release/setup/install.ts|prompt|p.confirm|2": "release setup install",
  "handlers/release/setup/uninstall.ts|prompt|p.confirm|1": "release setup uninstall",
  "handlers/shared.ts|prompt|p.text|1": "init",
  "handlers/start.ts|prompt|p.confirm|1": "start",
  "handlers/sync.ts|prompt-helper|ctx.output.confirm|1": "sync",
  "handlers/user-sync.ts|prompt|p.select|1": "user sync",
  "handlers/user-sync.ts|prompt|p.confirm|1": "user sync",
  "handlers/user-sync.ts|prompt|p.confirm|2": "user sync",
  "handlers/user.ts|prompt|p.select|1": "user open",
  "handlers/user.ts|prompt|p.confirm|1": "user pull",
  "handlers/view.ts|subprocess|execFileAsync|1": "view",
  "handlers/view.ts|subprocess|spawn|1": "view",
  "lib/command-input/interaction-context.ts|environment-policy|process.env.CI|1": "init",
  "lib/command-input/interaction-context.ts|environment-policy|process.env.CI|2": "status",
  "lib/git/process-executor.ts|subprocess|execa|1": "sync",
  "lib/git/process-executor.ts|subprocess|execa|2": "sync",
  "lib/git/push-worktree.ts|subprocess|execa|1": "sync",
  "lib/inbox-entry-operand.ts|explicit-stdin|process.stdin|1": "errand open",
  "lib/inbox-entry-operand.ts|explicit-stdin|process.stdin|2": "errand open",
  "lib/io-context.ts|subprocess|execa|1": "sync",
  "lib/io-context.ts|subprocess|execa|2": "sync",
  "lib/io-context.ts|subprocess|execa|3": "sync",
  "lib/sync-output.ts|prompt|p.confirm|1": "sync",
  "lib/sync-output.ts|prompt|p.select|1": "sync",
  "prompts/init-prompts.ts|prompt|p.text|1": "init",
  "prompts/init-prompts.ts|prompt|p.select|1": "init",
  "prompts/init-prompts.ts|prompt|p.confirm|1": "init",
  "prompts/join-prompts.ts|prompt|p.select|1": "join",
  "prompts/reconfigure-prompts.ts|prompt|p.text|1": "init",
  "prompts/reconfigure-prompts.ts|prompt|p.select|1": "init",
  "prompts/reconfigure-prompts.ts|prompt|p.confirm|1": "init",
  "prompts/removal-prompts.ts|prompt|p.select|1": "init",
  "prompts/removal-prompts.ts|prompt|p.select|2": "init",
  "scripts/remedy-roadmap-conflict.ts|subprocess|execFileAsync|1": "hook-remedy-roadmap-conflict",
  "scripts/validate-decompose-record.ts|subprocess|execFileAsync|1": "hook-validate-decompose-record",
  "scripts/validate-decompose-record.ts|subprocess|execFileAsync|2": "hook-validate-decompose-record",
  "scripts/validate-decompose-record.ts|subprocess|execFileAsync|3": "hook-validate-decompose-record",
  "scripts/validate-decompose-record.ts|subprocess|execFileAsync|4": "hook-validate-decompose-record",
});

const AUTHORITY_YES = new Set(["abandon", "user pull", "user sync", "sync", "release setup install"]);
const MACHINE_OPTIONS = new Set(["json", "session-init", "session-handoff", "recover"]);

function optionName(flags: string): string {
  return /--([a-z0-9-]+)/u.exec(flags)?.[1] ?? flags;
}

function syntaxSites(
  command: DiscoveredCommand,
  registrations: readonly CommandInputRegistration[],
): CommandInputDeclaration["sites"] {
  const registered = registrations.some((entry) => entry.commandPath === command.path);
  const opaque = command.path === "release commit" || command.path === "release push";
  return [
    ...command.operands.map((operand) => ({
      id: `operand.${operand.name}`,
      source: { file: operand.file, line: operand.line },
      origin: "syntax" as const,
      acquisition: opaque ? "opaque-passthrough" as const : operand.required ? "parser-required" as const : "optional" as const,
      schemaOwnership: opaque ? "opaque" as const : registered ? "owned" as const : "none" as const,
      ...(opaque || !registered ? {} : { schemaField: operand.name }),
      cancellation: "not-applicable" as const,
      automation: {
        noInput: "same" as const,
        flags: [],
        acceptedSyntax: [operand.required ? `<${operand.name}>` : `[${operand.name}]`],
      },
      mutationBoundary: `${command.path} handler`,
      subprocess: opaque ? "opaque-arguments" as const : "none" as const,
    })),
    ...command.options.map((option) => {
      const name = optionName(option.flags);
      const machine = MACHINE_OPTIONS.has(name);
      const authority = name === "yes" && AUTHORITY_YES.has(command.path);
      const schemaOwned = registered && option.valueName !== null;
      return {
        id: `option.${name}`,
        source: { file: option.file, line: option.line },
        origin: "syntax" as const,
        acquisition: machine
          ? "machine-mode" as const
          : authority ? "protected-confirmation" as const
            : option.defaultValue === undefined ? "optional" as const : "safe-default" as const,
        schemaOwnership: schemaOwned ? "owned" as const : "none" as const,
        ...(schemaOwned ? { schemaField: name } : {}),
        ...(option.defaultValue === undefined ? {} : { defaultSource: JSON.stringify(option.defaultValue) }),
        cancellation: "not-applicable" as const,
        automation: {
          noInput: authority ? "require-authority" as const : "same" as const,
          flags: [option.flags],
          acceptedSyntax: option.valueName === null ? [] : [option.flags],
        },
        mutationBoundary: machine ? "output selection" : `${command.path} handler`,
        subprocess: "none" as const,
      };
    }),
  ];
}

function interactionKeys(sites: readonly DiscoveredInteractionSite[]): readonly [DiscoveredInteractionSite, string][] {
  const counts = new Map<string, number>();
  return sites.map((site) => {
    const base = `${site.file}|${site.kind}|${site.callee}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return [site, `${base}|${String(count)}`];
  });
}

function interactionPolicy(site: DiscoveredInteractionSite, key: string): CommandInputDeclaration["sites"][number] {
  const owner = INTERACTION_OWNERS[key];
  if (owner === undefined) throw new Error(`Unclassified interaction site: ${key}`);
  const id = `interaction.${key.toLowerCase().replace(/[^a-z0-9.-]+/gu, "-")}`;
  if (site.kind === "explicit-stdin") {
    return {
      id, source: { file: site.file, line: site.line }, origin: "declaration",
      acquisition: "explicit-stdin", schemaOwnership: "none", cancellation: "not-applicable",
      automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] },
      mutationBoundary: `${owner} input preflight`, subprocess: "explicit-stdin",
    };
  }
  if (site.kind === "subprocess") {
    const capturedOutput = owner.startsWith("hook-");
    const subprocess = owner === "view"
      ? "presenter"
      : owner === "release commit" ? "editor"
        : capturedOutput ? "close-stdin" : "terminal-prompts";
    return {
      id, source: { file: site.file, line: site.line }, origin: "declaration",
      acquisition: owner === "view" ? "presenter" : "subprocess", schemaOwnership: "none",
      cancellation: "not-applicable",
      automation: {
        noInput: owner === "view" ? "render-directly" : capturedOutput ? "same" : "disable-terminal-input",
        flags: [], acceptedSyntax: [],
      },
      mutationBoundary: `${owner} subprocess boundary`, subprocess,
    };
  }
  if (site.kind === "environment-policy") {
    return {
      id, source: { file: site.file, line: site.line }, origin: "declaration",
      acquisition: "derived", schemaOwnership: "none", derivationSource: site.callee,
      cancellation: "not-applicable", automation: { noInput: "same", flags: [], acceptedSyntax: [] },
      mutationBoundary: `${owner} interaction resolution`, subprocess: "none",
    };
  }
  const requiredEvidence = key === "handlers/release/setup/install.ts|prompt|p.confirm|2"
    || key === "handlers/release/setup/uninstall.ts|prompt|p.confirm|1";
  const protectedPrompt = key === "handlers/release/setup/install.ts|prompt|p.confirm|1"
    || key.includes("user-sync.ts|prompt|p.confirm")
    || key.includes("handlers/user.ts|prompt|p.confirm")
    || key.includes("handlers/sync.ts|prompt-helper|ctx.output.confirm");
  const courtesy = key === "handlers/start.ts|prompt|p.confirm|1";
  return {
    id, source: { file: site.file, line: site.line }, origin: "declaration",
    acquisition: courtesy
      ? "courtesy-confirmation"
      : requiredEvidence ? "required-evidence"
        : protectedPrompt ? "protected-confirmation" : "handler-required",
    schemaOwnership: "none", cancellation: "stop",
    automation: {
      noInput: courtesy ? "proceed" : protectedPrompt ? "require-authority" : "require-explicit",
      flags: [],
      acceptedSyntax: requiredEvidence
        ? [key.includes("uninstall") ? "--cleanup-verified" : "--workflow-verified"]
        : protectedPrompt ? ["--yes"] : ["command value option"],
    },
    mutationBoundary: `${owner} handler`, subprocess: "none",
  };
}

async function sourceTexts(sourceRoot: string): Promise<Readonly<Record<string, string>>> {
  const result: Record<string, string> = {};
  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) return visit(path);
      if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        result[relative(sourceRoot, path).replaceAll("\\", "/")] = await readFile(path, "utf8");
      }
    }));
  }
  await visit(sourceRoot);
  return result;
}

/** Build and reconcile the live repository command-input inventory. */
export async function buildRepositoryCommandInputInventory(
  sourceRoot: string,
  registrations: readonly CommandInputRegistration[],
): Promise<CommandInputInventory> {
  const root = resolve(sourceRoot);
  const source = await scanCommandInputSources({ sourceRoot: root });
  const byCommand = new Map<string, CommandInputDeclaration>();
  for (const command of source.commands) {
    if (command.operands.length === 0 && command.options.length === 0) continue;
    byCommand.set(command.path, {
      commandPath: command.path,
      aliases: [...command.aliases],
      sites: [...syntaxSites(command, registrations)],
    });
  }
  for (const [site, key] of interactionKeys(source.interactions)) {
    const owner = INTERACTION_OWNERS[key];
    if (owner === undefined) throw new Error(`Unclassified interaction site: ${key}`);
    let declaration = byCommand.get(owner);
    if (declaration === undefined) {
      const command = source.commands.find((candidate) => candidate.path === owner);
      if (command === undefined) throw new Error(`Interaction owner is not a command: ${owner}`);
      const created: CommandInputDeclaration = { commandPath: owner, aliases: [...command.aliases], sites: [] };
      byCommand.set(owner, created);
      declaration = created;
    }
    declaration.sites.push(interactionPolicy(site, key));
  }
  const start = byCommand.get("start");
  if (start !== undefined) {
    start.sites.push({
      id: "safety.indeterminate-lifecycle", source: { file: "handlers/start.ts", symbol: "handleStart" },
      origin: "declaration", acquisition: "interactive-only-override", schemaOwnership: "none",
      cancellation: "stop", automation: { noInput: "refuse", flags: [], acceptedSyntax: [] },
      mutationBoundary: "start lifecycle safety gate", subprocess: "none",
    });
  }
  return reconcileCommandInputInventory({
    source,
    declarations: [...byCommand.values()],
    sourceFiles: await sourceTexts(root),
  });
}

/** Render the inventory as stable tab-separated rows. */
export function renderCommandInputInventory(inventory: CommandInputInventory): string {
  const header = "identity\torigin\tacquisition\tschema\tno-input\tsubprocess\tmutation-boundary";
  const rows = inventory.entries.map((entry) => [
    entry.identity,
    entry.origin,
    entry.acquisition,
    entry.schemaOwnership,
    entry.noInput,
    entry.subprocess,
    entry.mutationBoundary,
  ].join("\t"));
  return `${[header, ...rows].join("\n")}\n`;
}
