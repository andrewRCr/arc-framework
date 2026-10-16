/** Input schemas and interaction policy for the six newly registered store verbs. */
import { z } from "zod";
import { SlugSchema } from "../lib/kernel/index.js";
import { declareCliOptionSite, declareCliOperandSite, declareInteractionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";

/** Personal/project/work-item list selector; generation IDs are admitted by store lookup. */
const list = z.string().min(1);
const file = z.string().min(1);
/** A selected inbox and its optional target and output mode. */
export const InboxInputSchema = z.strictObject({ list, target: SlugSchema.optional(), json: z.boolean().optional() });
/** Move source fields are optional in the insertion form. */
export const RouteInputSchema = z.strictObject({ entryId: z.string().regex(/^[0-9a-f]{8}$/u).optional(), from: list.optional(), expectedVersion: z.string().min(1).optional(), to: list, section: z.string().min(1).optional() });
/** Optional occupant name for the entering checkout's release. */
export const LocusReleaseInputSchema = z.strictObject({ slug: SlugSchema.optional() });
/** Queue listing output mode. */
export const ErrandQueueInputSchema = z.strictObject({ json: z.boolean().optional() });
/** Explicit path or stdin marker for a versioned queue replacement request. */
export const ErrandQueueSetInputSchema = z.strictObject({ file });
/** Explicit path or stdin marker for a versioned handoff write request. */
export const HandoffWriteInputSchema = z.strictObject({ file });

/** Canonical schemas for each invocable command path. */
export const storeCommandInputRegistrations = [
  { commandPath: "inbox", schema: InboxInputSchema, schemaFields: { "operand.list": "list", "option.target": "target", "option.json": "json" } },
  { commandPath: "route", schema: RouteInputSchema, schemaFields: { "operand.entry-id": "entryId", "option.from": "from", "option.expected-version": "expectedVersion", "option.to": "to", "option.section": "section" } },
  { commandPath: "locus release", schema: LocusReleaseInputSchema, schemaFields: { "operand.slug": "slug" } },
  { commandPath: "errand queue", schema: ErrandQueueInputSchema, schemaFields: { "option.json": "json" } },
  { commandPath: "errand queue set", schema: ErrandQueueSetInputSchema, schemaFields: { "operand.file": "file" } },
  { commandPath: "handoff write", schema: HandoffWriteInputSchema, schemaFields: { "operand.file": "file" } },
] as const satisfies readonly CommandInputRegistration[];

const inboxStdinSites = ([1, 2] as const).map((occurrence) => declareInteractionSite(
  { file: "handlers/inbox-runtime.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence },
  { acquisition: "explicit-stdin", schemaOwnership: "none", cancellation: "not-applicable", automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] }, mutationBoundary: "entry or queue request read", subprocess: "explicit-stdin" },
));
const handoffStdinSite = declareInteractionSite(
  { file: "handlers/handoff-write.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence: 1 },
  { acquisition: "explicit-stdin", schemaOwnership: "none", cancellation: "not-applicable",
    automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] },
    mutationBoundary: "handoff request read", subprocess: "explicit-stdin" },
);

/** Explicit stdin belongs to insertion and versioned request forms; output selection is deterministic. */
export const storeCommandInputPolicyDeclarations: readonly CommandInputDeclaration[] = [
  ...["inbox", "errand queue"].map((commandPath) => ({
    commandPath, aliases: [], sites: [declareCliOptionSite("json", {
      acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json", cancellation: "not-applicable",
      automation: { noInput: "same", flags: ["--json", "--no-input"], acceptedSyntax: [] }, mutationBoundary: "output selection", subprocess: "none",
    })],
  })),
  { commandPath: "route", aliases: [], sites: [declareCliOptionSite("to", {
    acquisition: "parser-required", schemaOwnership: "owned", schemaField: "to", cancellation: "not-applicable",
    automation: { noInput: "require-explicit", flags: ["--to", "--no-input"], acceptedSyntax: [] }, mutationBoundary: "destination selection", subprocess: "none",
  }), ...inboxStdinSites] },
  { commandPath: "locus release", aliases: [], sites: [declareCliOperandSite("slug", {
    acquisition: "optional", schemaOwnership: "owned", schemaField: "slug", cancellation: "not-applicable",
    automation: { noInput: "preserve-absent", flags: ["--no-input"], acceptedSyntax: [] }, mutationBoundary: "occupant selection", subprocess: "none",
  })] },
  ...["errand queue set", "handoff write"].map((commandPath) => ({
    commandPath, aliases: [], sites: [declareCliOperandSite("file", {
      acquisition: "parser-required", schemaOwnership: "owned", schemaField: "file", cancellation: "not-applicable",
      automation: { noInput: "require-explicit", flags: ["--no-input"], acceptedSyntax: ["<file>", "-"] }, mutationBoundary: "request source selection", subprocess: "none",
    }), ...(commandPath === "errand queue set" ? inboxStdinSites : [handoffStdinSite])],
  })),
];
