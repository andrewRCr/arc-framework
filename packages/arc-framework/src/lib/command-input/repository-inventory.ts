/** Repository-owned command-input declaration projection and inventory rendering. */

import { resolve } from "node:path";

import type { CommandInputDeclaration } from "./declaration.js";
import type { CommandInputRegistration } from "./registry.js";
import { reconcileCommandInputInventory, type CommandInputInventory } from "./inventory.js";
import {
  loadCommandInputSourceSnapshot,
  type CommandInputSourceInventory,
  type DiscoveredCommand,
} from "./source-scanner.js";

/** One immutable source snapshot used for repository inventory projection. */
export interface RepositoryCommandInputSnapshot {
  readonly source: CommandInputSourceInventory;
  readonly sourceFiles: Readonly<Record<string, string>>;
}

function optionName(flags: string): string {
  return /--([a-z0-9-]+)/u.exec(flags)?.[1] ?? flags;
}

function syntaxSites(
  command: DiscoveredCommand,
  registrations: readonly CommandInputRegistration[],
): CommandInputDeclaration["sites"] {
  const registration = registrations.find((entry) => entry.commandPath === command.path);
  return [
    ...command.operands.map((operand) => {
      const id = `operand.${operand.name}`;
      const schemaField = registration?.schemaFields?.[id];
      return {
      id,
      source: { file: operand.file, line: operand.line },
      origin: "syntax" as const,
      acquisition: operand.required ? "parser-required" as const : "optional" as const,
      schemaOwnership: schemaField === undefined ? "none" as const : "owned" as const,
      ...(schemaField === undefined ? {} : { schemaField }),
      cancellation: "not-applicable" as const,
      automation: {
        noInput: "same" as const,
        flags: [],
        acceptedSyntax: [operand.required ? `<${operand.name}>` : `[${operand.name}]`],
      },
      mutationBoundary: `${command.path} handler`,
      subprocess: "none" as const,
    };
    }),
    ...command.options.map((option) => {
      const name = optionName(option.flags);
      const id = `option.${name}`;
      const schemaField = registration?.schemaFields?.[id];
      const schemaOwned = schemaField !== undefined;
      return {
        id,
        source: { file: option.file, line: option.line },
        origin: "syntax" as const,
        acquisition: "optional" as const,
        schemaOwnership: schemaOwned ? "owned" as const : "none" as const,
        ...(schemaOwned ? { schemaField } : {}),
        ...(option.defaultValue === undefined ? {} : { defaultSource: JSON.stringify(option.defaultValue) }),
        cancellation: "not-applicable" as const,
        automation: {
          noInput: "same" as const,
          flags: [option.flags],
          acceptedSyntax: option.valueName === null ? [] : [option.flags],
        },
        mutationBoundary: `${command.path} handler`,
        subprocess: "none" as const,
      };
    }),
  ];
}

/**
 * Load the source discoveries and texts used by one inventory projection.
 *
 * @param sourceRoot - Package source root to inspect.
 * @returns One internally consistent repository source snapshot.
 */
export async function loadRepositoryCommandInputSnapshot(
  sourceRoot: string,
): Promise<RepositoryCommandInputSnapshot> {
  return loadCommandInputSourceSnapshot({ sourceRoot: resolve(sourceRoot) });
}

/**
 * Build and reconcile an inventory from one repository source snapshot.
 *
 * @param snapshot - Preloaded repository source snapshot.
 * @param registrations - Command-owned schema registrations.
 * @returns Reconciled command-input inventory.
 */
export function buildRepositoryCommandInputInventoryFromSnapshot(
  snapshot: RepositoryCommandInputSnapshot,
  registrations: readonly CommandInputRegistration[],
  policyDeclarations: readonly CommandInputDeclaration[] = [],
): CommandInputInventory {
  const { source } = snapshot;
  const byCommand = new Map<string, CommandInputDeclaration>();
  for (const command of source.commands) {
    if (command.operands.length === 0 && command.options.length === 0) continue;
    byCommand.set(command.path, {
      commandPath: command.path,
      aliases: [...command.aliases],
      sites: [...syntaxSites(command, registrations)],
    });
  }
  for (const policy of policyDeclarations) {
    let declaration = byCommand.get(policy.commandPath);
    if (declaration === undefined) {
      const command = source.commands.find((candidate) => candidate.path === policy.commandPath);
      if (command !== undefined) {
        declaration = { commandPath: command.path, aliases: [...command.aliases], sites: [] };
        byCommand.set(command.path, declaration);
      }
    }
    if (declaration === undefined) {
      throw new Error(`Policy declaration names an unknown command: ${policy.commandPath}`);
    }
    for (const site of policy.sites) {
      const existing = declaration.sites.findIndex((candidate) => candidate.id === site.id);
      if (existing === -1) declaration.sites.push(site);
      else declaration.sites.splice(existing, 1, site);
    }
  }
  return reconcileCommandInputInventory({
    source,
    declarations: [...byCommand.values()],
    sourceFiles: snapshot.sourceFiles,
  });
}

/**
 * Build and reconcile the live repository command-input inventory.
 *
 * @param sourceRoot - Package source root to inspect.
 * @param registrations - Command-owned schema registrations.
 * @returns Reconciled command-input inventory.
 */
export async function buildRepositoryCommandInputInventory(
  sourceRoot: string,
  registrations: readonly CommandInputRegistration[],
  policyDeclarations: readonly CommandInputDeclaration[] = [],
): Promise<CommandInputInventory> {
  const snapshot = await loadRepositoryCommandInputSnapshot(sourceRoot);
  return buildRepositoryCommandInputInventoryFromSnapshot(snapshot, registrations, policyDeclarations);
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
