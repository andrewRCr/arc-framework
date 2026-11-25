/** Title-source validation for the inbox removal command.
 * @module
 */

import { z } from "zod";

/** Options for the `arc user inbox-remove` subcommand. */
export interface UserInboxRemoveOptions {
  id?: string;
  expectedVersion?: string;
  /** UTF-8 file containing the capture's inner bold title, or `-` for stdin. */
  inboxTitleFile?: string;
  /** Compatibility alias of `inboxTitleFile`. */
  inboxEntryFile?: string;
}

/** Validated, mutually exclusive title sources for inbox removal. */
export const UserInboxRemoveInputSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{8}$/u).optional(),
  expectedVersion: z.string().regex(/^v1:[0-9a-f]{16}$/u).optional(),
  literal: z.string().min(1).optional(),
  inboxTitleFile: z.string().min(1).optional(),
  inboxEntryFile: z.string().min(1).optional(),
}).strict().superRefine((value, refinement) => {
  const sources = [
    { label: "positional title", value: value.literal },
    { label: "--inbox-title-file", value: value.inboxTitleFile },
    { label: "--inbox-entry-file", value: value.inboxEntryFile },
  ].filter((source) => source.value !== undefined);
  if (value.id !== undefined || value.expectedVersion !== undefined) {
    if (value.id !== undefined && value.expectedVersion !== undefined && sources.length === 0) return;
    refinement.addIssue({ code: "custom", message: "Use --id <id> --expected-version <version> together without a title source; read arc inbox personal." });
    return;
  }
  if (sources.length === 1) return;
  const received = sources.map((source) => `${source.label} ${JSON.stringify(source.value)}`).join("; ") || "none";
  refinement.addIssue({
    code: "custom",
    message: `Provide exactly one inbox title source. Received: ${received}. `
      + "Retry with one source: arc user inbox-remove <title>, "
      + "arc user inbox-remove --inbox-title-file <path>, or "
      + "arc user inbox-remove --inbox-entry-file <path> (compatibility alias). Use - as the file path for stdin.",
  });
});
