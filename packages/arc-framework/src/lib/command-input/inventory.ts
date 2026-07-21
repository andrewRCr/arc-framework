/**
 * Deterministic reconciliation of discovered input sites with command-owned policy declarations.
 */

import { ArcError } from "../kernel/index.js";
import {
  defineCommandInputDeclarations,
  type AcquisitionClass,
  type CommandInputDeclaration,
} from "./declaration.js";
import type {
  CommandInputSourceInventory,
  DiscoveredCommand,
  DiscoveredInteractionSite,
  DiscoveredSourceLocus,
} from "./source-scanner.js";

/** Stable inventory reconciliation failure variants. */
export type CommandInputInventoryErrorCode =
  | "command-input.inventory.unclassified"
  | "command-input.inventory.duplicate"
  | "command-input.inventory.stale-source"
  | "command-input.inventory.unknown-command";

/** Inventory failure with a command-domain diagnostic. */
export class CommandInputInventoryError extends ArcError {
  override readonly code: CommandInputInventoryErrorCode;

  constructor(message: string, code: CommandInputInventoryErrorCode) {
    super(message, code);
    this.name = "CommandInputInventoryError";
    this.code = code;
  }
}
/** One joined source-site and policy record. */
export interface CommandInputInventoryEntry {
  readonly identity: string;
  readonly commandPath: string;
  readonly siteId: string;
  readonly origin: "syntax" | "declaration";
  readonly acquisition: AcquisitionClass;
  readonly schemaOwnership: "owned" | "opaque" | "none";
  readonly schemaField?: string;
  readonly cancellation: "stop" | "skip" | "safe-default" | "not-applicable";
  readonly noInput: string;
  readonly automationFlags: readonly string[];
  readonly acceptedSyntax: readonly string[];
  readonly mutationBoundary: string;
  readonly subprocess: string;
  readonly liveSource: DiscoveredSourceLocus | { readonly file: string; readonly symbol?: string; readonly line?: number };
}

/** Complete deterministic inventory. */
export interface CommandInputInventory {
  readonly entries: readonly CommandInputInventoryEntry[];
}

function optionName(flags: string): string {
  const long = /--([a-z0-9-]+)/u.exec(flags)?.[1];
  if (long !== undefined) return long;
  const short = /(?:^|,\s*)-([a-z0-9])/u.exec(flags)?.[1];
  if (short !== undefined) return short;
  throw new CommandInputInventoryError(
    `Cannot derive option identity from ${JSON.stringify(flags)}`,
    "command-input.inventory.unclassified",
  );
}

function discoveredSyntax(command: DiscoveredCommand): ReadonlyMap<string, DiscoveredSourceLocus> {
  const sites = new Map<string, DiscoveredSourceLocus>();
  for (const operand of command.operands) sites.set(`operand.${operand.name}`, operand);
  for (const option of command.options) sites.set(`option.${optionName(option.flags)}`, option);
  return sites;
}

function sourceExists(
  source: { readonly file: string; readonly symbol?: string; readonly line?: number },
  sourceFiles: Readonly<Record<string, string>>,
): boolean {
  const content = sourceFiles[source.file];
  if (content === undefined) return false;
  if (source.line !== undefined && (source.line < 1 || source.line > content.split(/\r?\n/u).length)) return false;
  if (source.symbol !== undefined && !new RegExp(`\\b${source.symbol.replaceAll("$", "\\$")}\\b`, "u").test(content)) {
    return false;
  }
  return true;
}

function interactionKey(site: Pick<DiscoveredInteractionSite, "file" | "line">): string {
  return `${site.file}:${String(site.line)}`;
}

function interactionSelectorKeys(
  sites: readonly DiscoveredInteractionSite[],
): ReadonlyMap<string, DiscoveredInteractionSite> {
  const counts = new Map<string, number>();
  const selected = new Map<string, DiscoveredInteractionSite>();
  for (const site of sites) {
    const base = `${site.file}|${site.kind}|${site.callee}`;
    const occurrence = (counts.get(base) ?? 0) + 1;
    counts.set(base, occurrence);
    selected.set(`${base}|${String(occurrence)}`, site);
  }
  return selected;
}

/**
 * Join the scanner oracle with typed declarations and reject every mismatch.
 *
 * @param input - Source discoveries, declarations, and source text used to verify declared loci.
 * @returns Stable inventory entries sorted by identity.
 */
export function reconcileCommandInputInventory(input: {
  readonly source: CommandInputSourceInventory;
  readonly declarations: readonly CommandInputDeclaration[];
  readonly sourceFiles: Readonly<Record<string, string>>;
}): CommandInputInventory {
  const declarations = defineCommandInputDeclarations(input.declarations);
  const commands = new Map(input.source.commands.map((command) => [command.path, command]));
  const interactions = new Map(input.source.interactions.map((site) => [interactionKey(site), site]));
  const interactionsBySelector = interactionSelectorKeys(input.source.interactions);
  const claimedInteractions = new Set<string>();
  const entries: CommandInputInventoryEntry[] = [];

  for (const declaration of declarations) {
    const command = commands.get(declaration.commandPath);
    if (command === undefined) {
      throw new CommandInputInventoryError(
        `Declaration names unknown canonical command: ${declaration.commandPath}`,
        "command-input.inventory.unknown-command",
      );
    }
    const syntax = discoveredSyntax(command);
    const claimedSyntax = new Set<string>();
    for (const site of declaration.sites) {
      if (!sourceExists(site.source, input.sourceFiles)) {
        throw new CommandInputInventoryError(
          `Declared source locus no longer resolves: ${site.source.file}:${String(site.source.line ?? site.source.symbol ?? "?")}`,
          "command-input.inventory.stale-source",
        );
      }
      let liveSource: CommandInputInventoryEntry["liveSource"] = site.source;
      if (site.origin === "syntax") {
        const discovered = syntax.get(site.id);
        if (discovered === undefined) {
          throw new CommandInputInventoryError(
            `Command ${declaration.commandPath} has unresolved syntax declaration: ${site.id}`,
            "command-input.inventory.unclassified",
          );
        }
        claimedSyntax.add(site.id);
        liveSource = discovered;
      } else if (site.source.line !== undefined || site.source.interaction !== undefined) {
        const selector = site.source.interaction;
        const interaction = selector === undefined
          ? interactions.get(interactionKey({ file: site.source.file, line: site.source.line ?? 0 }))
          : interactionsBySelector.get(
            `${site.source.file}|${selector.kind}|${selector.callee}|${String(selector.occurrence)}`,
          );
        if (interaction !== undefined) {
          const key = interactionKey(interaction);
          if (claimedInteractions.has(key)) {
            throw new CommandInputInventoryError(
              `Interaction site is multiply classified: ${key}`,
              "command-input.inventory.duplicate",
            );
          }
          claimedInteractions.add(key);
          liveSource = interaction;
        }
      }
      entries.push({
        identity: `${declaration.commandPath}:${site.id}`,
        commandPath: declaration.commandPath,
        siteId: site.id,
        origin: site.origin,
        acquisition: site.acquisition,
        schemaOwnership: site.schemaOwnership,
        ...(site.schemaField === undefined ? {} : { schemaField: site.schemaField }),
        cancellation: site.cancellation,
        noInput: site.automation.noInput,
        automationFlags: site.automation.flags,
        acceptedSyntax: site.automation.acceptedSyntax,
        mutationBoundary: site.mutationBoundary,
        subprocess: site.subprocess,
        liveSource,
      });
    }
    for (const siteId of syntax.keys()) {
      if (!claimedSyntax.has(siteId)) {
        throw new CommandInputInventoryError(
          `Discovered site is unclassified: ${declaration.commandPath}:${siteId}`,
          "command-input.inventory.unclassified",
        );
      }
    }
  }

  for (const command of input.source.commands) {
    if ((command.operands.length > 0 || command.options.length > 0) && !declarations.some(
      (declaration) => declaration.commandPath === command.path,
    )) {
      throw new CommandInputInventoryError(
        `Input-bearing command has no declaration: ${command.path}`,
        "command-input.inventory.unclassified",
      );
    }
  }
  for (const [key] of interactions) {
    if (!claimedInteractions.has(key)) {
      throw new CommandInputInventoryError(
        `Interaction site is unclassified: ${key}`,
        "command-input.inventory.unclassified",
      );
    }
  }

  entries.sort((left, right) => left.identity < right.identity ? -1 : left.identity > right.identity ? 1 : 0);
  return { entries: Object.freeze(entries) };
}
