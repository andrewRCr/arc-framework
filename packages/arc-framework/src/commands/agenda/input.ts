/** Command-owned input vocabulary for agenda compilation. */

import { z } from "zod";
import { declareCliOptionSite, type CommandInputDeclaration } from "../../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../../lib/command-input/registry.js";

/** Raw operands and options delivered by the command parser. */
export const AgendaCommandInputSchema = z.strictObject({
  ceremony: z.string(), seed: z.string().optional(),
  plan: z.union([z.string(), z.literal(true)]).optional(),
  errand: z.union([z.string(), z.literal(true)]).optional(),
  next: z.literal(true).optional(), isolate: z.literal(true).optional(),
  start: z.string().optional(), housekeep: z.literal(true).optional(), context: z.literal(true).optional(),
  json: z.boolean().optional(), answered: z.array(z.string()).optional(), done: z.array(z.string()).optional(),
});

/** Validated raw operands and options for the agenda adapter. */
export type AgendaCommandInput = z.infer<typeof AgendaCommandInputSchema>;
/** Commander options, with operands supplied separately. */
export type AgendaCliOptions = Omit<AgendaCommandInput, "ceremony" | "seed">;

/** Registry contribution owned by the agenda verb. */
export const agendaCommandInputRegistration = {
  commandPath: "agenda", schema: AgendaCommandInputSchema,
  schemaFields: {
    "operand.ceremony": "ceremony", "operand.seed": "seed", "option.plan": "plan", "option.errand": "errand",
    "option.next": "next", "option.isolate": "isolate", "option.start": "start", "option.housekeep": "housekeep",
    "option.context": "context", "option.json": "json", "option.answered": "answered", "option.done": "done",
  },
} satisfies CommandInputRegistration;

/** Machine output and subprocess interaction policy owned by the agenda adapter. */
export const agendaCommandInputPolicyDeclarations = [{
  commandPath: "agenda", aliases: [], sites: [
    declareCliOptionSite("json", {
      acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json",
      cancellation: "not-applicable", automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection", subprocess: "none",
    }),
    {
      id: "semantic.interaction-context", source: { file: "commands/agenda/index.ts", symbol: "handleAgenda" },
      origin: "declaration", acquisition: "derived", schemaOwnership: "none",
      derivationSource: "shared InteractionContext", cancellation: "not-applicable",
      automation: { noInput: "same", flags: ["--no-input", "--json"], acceptedSyntax: [] },
      mutationBoundary: "agenda probe orchestration", subprocess: "terminal-prompts",
    },
  ],
}] satisfies readonly CommandInputDeclaration[];
