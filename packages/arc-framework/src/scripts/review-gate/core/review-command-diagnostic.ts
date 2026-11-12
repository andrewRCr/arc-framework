/** Diagnostic contracts shared by review envelopes without registry dependencies. */

import { z } from "zod";

const RepositoryPreconditionDiagnosticSchema = z.strictObject({
  code: z.literal("repository-precondition"),
  message: z.string().trim().min(1),
  precondition: z.enum([
    "repository-born",
    "base-resolved",
    "clean-worktree",
    "commit-head",
  ]),
});
const GeneralReviewCommandDiagnosticSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u),
  message: z.string().trim().min(1),
});
export const ReviewCommandDiagnosticSchema = z.union([
  RepositoryPreconditionDiagnosticSchema,
  GeneralReviewCommandDiagnosticSchema,
]);
