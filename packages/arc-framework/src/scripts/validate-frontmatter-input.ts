/** Canonical input contract for the hidden `arc hook-validate-frontmatter` hook command. */

import { z } from "zod";

import { declareInteractionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";

/** Staged paths the pre-commit hook hands the frontmatter validator; an empty list validates nothing. */
export const ValidateFrontmatterInputSchema = z.object({
  paths: z.array(z.string().min(1)),
}).strict();

/** Registry contribution owned by the frontmatter hook command. */
export const validateFrontmatterInputRegistration = {
  commandPath: "hook-validate-frontmatter",
  schema: ValidateFrontmatterInputSchema,
  schemaFields: { "operand.paths": "paths" },
} satisfies CommandInputRegistration;

/** Closed-stdin Git read owned by the frontmatter hook command: `git show :<path>` for each staged path. */
export const validateFrontmatterInputPolicyDeclarations = [{
  commandPath: "hook-validate-frontmatter", aliases: [], sites: [declareInteractionSite(
    { file: "scripts/validate-frontmatter.ts", kind: "subprocess", callee: "execFileSync", occurrence: 1 },
    {
      acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
      automation: { noInput: "same", flags: [], acceptedSyntax: [] },
      mutationBoundary: "hook-validate-frontmatter subprocess boundary", subprocess: "close-stdin",
    },
  )],
}] satisfies readonly CommandInputDeclaration[];
