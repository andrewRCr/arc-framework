/** Canonical input contract for the hidden `arc hook-validate-frontmatter` hook command. */

import { z } from "zod";

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
