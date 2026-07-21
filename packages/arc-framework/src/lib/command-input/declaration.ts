/**
 * Typed policy declarations for command-owned input and interaction sites.
 */

import { z } from "zod";

import { ArcError } from "../kernel/index.js";

const CommandPathSchema = z.string().trim().min(1).regex(/^[a-z0-9][a-z0-9-]*(?: [a-z0-9][a-z0-9-]*)*$/u);

/** How a command obtains or authorizes one semantic input site. */
export const AcquisitionClassSchema = z.enum([
  "supplied",
  "derived",
  "parser-required",
  "optional",
  "safe-default",
  "handler-required",
  "courtesy-confirmation",
  "protected-confirmation",
  "interactive-only-override",
  "required-evidence",
  "explicit-stdin",
  "opaque-passthrough",
  "machine-mode",
  "presenter",
  "subprocess",
]);

/** How a command obtains or authorizes one semantic input site. */
export type AcquisitionClass = z.infer<typeof AcquisitionClassSchema>;

/** Whether a site's value belongs to the canonical command object schema. */
export const SchemaOwnershipSchema = z.enum(["owned", "opaque", "none"]);

/** Behavior when an interactive acquisition is cancelled. */
export const CancellationBehaviorSchema = z.enum(["stop", "skip", "safe-default", "not-applicable"]);

/** Behavior when the invocation cannot interact. */
export const NoInputBehaviorSchema = z.enum([
  "same",
  "preserve-absent",
  "use-default",
  "require-explicit",
  "proceed",
  "require-authority",
  "refuse",
  "read-explicit-stdin",
  "render-directly",
  "disable-terminal-input",
]);

/** Child-process interaction policy represented by an inventory site. */
export const SubprocessPolicySchema = z.enum([
  "none",
  "close-stdin",
  "explicit-stdin",
  "terminal-prompts",
  "presenter",
  "editor",
  "opaque-arguments",
]);

/** Stable source location for a syntactic or declaration-originated site. */
export const CommandInputSourceSchema = z.object({
  file: z.string().min(1),
  symbol: z.string().min(1).optional(),
  line: z.number().int().positive().optional(),
  interaction: z.object({
    kind: z.enum(["prompt", "prompt-helper", "environment-policy", "explicit-stdin", "subprocess"]),
    callee: z.string().min(1),
    occurrence: z.number().int().positive(),
  }).strict().optional(),
}).strict();

/** Complete policy for one input-bearing or interaction-capable site. */
export const CommandInputSiteSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9.-]*$/u),
  source: CommandInputSourceSchema,
  origin: z.enum(["syntax", "declaration"]),
  acquisition: AcquisitionClassSchema,
  schemaOwnership: SchemaOwnershipSchema,
  schemaField: z.string().min(1).optional(),
  defaultSource: z.string().min(1).optional(),
  derivationSource: z.string().min(1).optional(),
  cancellation: CancellationBehaviorSchema,
  automation: z.object({
    noInput: NoInputBehaviorSchema,
    flags: z.array(z.string().min(1)).default([]),
    acceptedSyntax: z.array(z.string().min(1)).default([]),
  }).strict(),
  mutationBoundary: z.string().min(1),
  subprocess: SubprocessPolicySchema,
}).strict();

/** Complete typed policy for one input-bearing or interaction-capable site. */
export type CommandInputSite = z.input<typeof CommandInputSiteSchema>;

/**
 * Build a stable declaration site for one AST-discovered interaction.
 *
 * The caller supplies every semantic policy field; this helper derives only the
 * mechanical identity used to join the declaration to the source scan.
 */
export function declareInteractionSite(
  source: {
    readonly file: string;
    readonly kind: "prompt" | "prompt-helper" | "environment-policy" | "explicit-stdin" | "subprocess";
    readonly callee: string;
    readonly occurrence: number;
  },
  policy: Omit<CommandInputSite, "id" | "source" | "origin">,
): CommandInputSite {
  const selector = `${source.file}|${source.kind}|${source.callee}|${String(source.occurrence)}`;
  return {
    id: `interaction.${selector.toLowerCase().replace(/[^a-z0-9.-]+/gu, "-")}`,
    source: {
      file: source.file,
      interaction: { kind: source.kind, callee: source.callee, occurrence: source.occurrence },
    },
    origin: "declaration",
    ...policy,
  };
}

/** Build a declaration override for one Commander option discovered in `cli.ts`. */
export function declareCliOptionSite(
  option: string,
  policy: Omit<CommandInputSite, "id" | "source" | "origin">,
): CommandInputSite {
  return {
    id: `option.${option}`,
    source: { file: "cli.ts", symbol: "program" },
    origin: "syntax",
    ...policy,
  };
}

/** Build a declaration override for one Commander operand discovered in `cli.ts`. */
export function declareCliOperandSite(
  operand: string,
  policy: Omit<CommandInputSite, "id" | "source" | "origin">,
): CommandInputSite {
  return {
    id: `operand.${operand}`,
    source: { file: "cli.ts", symbol: "program" },
    origin: "syntax",
    ...policy,
  };
}

/** A canonical command's complete non-syntactic input-policy declaration. */
export const CommandInputDeclarationSchema = z.object({
  commandPath: CommandPathSchema,
  aliases: z.array(CommandPathSchema).default([]),
  aliasOf: CommandPathSchema.optional(),
  sites: z.array(CommandInputSiteSchema),
}).strict();

/** A canonical command's complete non-syntactic input-policy declaration. */
export type CommandInputDeclaration = z.input<typeof CommandInputDeclarationSchema>;

type ParsedCommandInputDeclaration = z.output<typeof CommandInputDeclarationSchema>;

/** Stable declaration-validation failure variants. */
export type CommandInputDeclarationErrorCode =
  | "command-input.declaration.invalid"
  | "command-input.declaration.contradictory"
  | "command-input.declaration.duplicate"
  | "command-input.declaration.dangling-alias";

/** Command-input declaration failure with command-domain diagnostics. */
export class CommandInputDeclarationError extends ArcError {
  override readonly code: CommandInputDeclarationErrorCode;

  constructor(message: string, code: CommandInputDeclarationErrorCode, options?: ErrorOptions) {
    super(message, code, options);
    this.name = "CommandInputDeclarationError";
    this.code = code;
  }
}
function contradiction(site: z.output<typeof CommandInputSiteSchema>): string | undefined {
  if (site.acquisition === "safe-default" && site.defaultSource === undefined) {
    return `Site ${site.id} declares a safe default without a default source`;
  }
  if (site.acquisition === "derived" && site.derivationSource === undefined) {
    return `Site ${site.id} declares a derived input without a derivation source`;
  }
  if (site.acquisition === "opaque-passthrough" && site.schemaOwnership !== "opaque") {
    return `Site ${site.id} is opaque passthrough but does not declare opaque schema ownership`;
  }
  if (site.schemaOwnership === "opaque" && site.acquisition !== "opaque-passthrough") {
    return `Site ${site.id} declares opaque schema ownership without opaque-passthrough acquisition`;
  }
  if (site.schemaOwnership === "owned" && site.schemaField === undefined) {
    return `Site ${site.id} is schema-owned without a schema field`;
  }
  if (site.acquisition === "handler-required" && site.automation.acceptedSyntax.length === 0) {
    return `Site ${site.id} is handler-required without accepted syntax`;
  }
  if (
    site.acquisition === "protected-confirmation"
    && site.automation.noInput !== "require-authority"
  ) {
    return `Site ${site.id} is a protected confirmation without explicit no-input authority`;
  }
  if (
    site.acquisition === "interactive-only-override"
    && site.automation.noInput !== "refuse"
  ) {
    return `Site ${site.id} is an interactive-only override that does not refuse no-input execution`;
  }
  if (site.acquisition === "required-evidence" && site.automation.noInput !== "require-explicit") {
    return `Site ${site.id} is required evidence without purpose-named explicit syntax`;
  }
  return undefined;
}

function freezeDeclaration(value: ParsedCommandInputDeclaration): ParsedCommandInputDeclaration {
  for (const site of value.sites) {
    Object.freeze(site.source);
    Object.freeze(site.automation.flags);
    Object.freeze(site.automation.acceptedSyntax);
    Object.freeze(site.automation);
    Object.freeze(site);
  }
  Object.freeze(value.aliases);
  Object.freeze(value.sites);
  return Object.freeze(value);
}

/**
 * Parse and validate one command-owned declaration.
 *
 * @param input - Untrusted declaration input.
 * @returns An immutable canonical declaration.
 */
export function defineCommandInputDeclaration(input: CommandInputDeclaration): ParsedCommandInputDeclaration {
  const parsed = CommandInputDeclarationSchema.safeParse(input);
  if (!parsed.success) {
    throw new CommandInputDeclarationError(
      `Invalid command-input declaration: ${z.prettifyError(parsed.error)}`,
      "command-input.declaration.invalid",
      { cause: parsed.error },
    );
  }

  const siteIds = new Set<string>();
  for (const site of parsed.data.sites) {
    if (siteIds.has(site.id)) {
      throw new CommandInputDeclarationError(
        `Command ${parsed.data.commandPath} has duplicate site identity: ${site.id}`,
        "command-input.declaration.duplicate",
      );
    }
    siteIds.add(site.id);
    const issue = contradiction(site);
    if (issue !== undefined) {
      throw new CommandInputDeclarationError(issue, "command-input.declaration.contradictory");
    }
  }
  return freezeDeclaration(parsed.data);
}

/**
 * Validate a complete declaration set and return it in deterministic order.
 *
 * @param inputs - Command-owned declarations to compose.
 * @returns Immutable declarations sorted by canonical command path.
 */
export function defineCommandInputDeclarations(
  inputs: readonly CommandInputDeclaration[],
): readonly ParsedCommandInputDeclaration[] {
  const declarations = inputs.map(defineCommandInputDeclaration);
  const canonical = new Map<string, ParsedCommandInputDeclaration>();
  for (const declaration of declarations) {
    if (canonical.has(declaration.commandPath)) {
      throw new CommandInputDeclarationError(
        `Duplicate canonical path: ${declaration.commandPath}`,
        "command-input.declaration.duplicate",
      );
    }
    canonical.set(declaration.commandPath, declaration);
  }

  const aliases = new Set<string>();
  for (const declaration of declarations) {
    for (const alias of declaration.aliases) {
      if (canonical.has(alias) || aliases.has(alias)) {
        throw new CommandInputDeclarationError(
          `Duplicate or colliding alias: ${alias}`,
          "command-input.declaration.duplicate",
        );
      }
      aliases.add(alias);
    }
    if (declaration.aliasOf !== undefined && !canonical.has(declaration.aliasOf)) {
      throw new CommandInputDeclarationError(
        `Dangling alias ${declaration.commandPath}: ${declaration.aliasOf}`,
        "command-input.declaration.dangling-alias",
      );
    }
  }

  return Object.freeze([...declarations].sort((left, right) =>
    left.commandPath < right.commandPath ? -1 : left.commandPath > right.commandPath ? 1 : 0));
}
