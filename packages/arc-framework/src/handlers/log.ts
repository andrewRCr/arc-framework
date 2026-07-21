/**
 * Handler for `arc log` subcommands.
 *
 * @module
 */

import * as p from "@clack/prompts";
import { z } from "zod";

import { runLogStandalone, buildLogStandaloneOutput } from "../commands/log.js";
import { gitExec } from "../lib/io-context.js";
import { isHandledError } from "./shared.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";

export interface LogStandaloneOptions {
  since?: string;
  author?: string;
  limit?: number;
  all?: boolean;
  category?: string;
}

/** Validated filters for standalone commit history. */
export const LogStandaloneInputSchema = z.object({
  since: z.string().trim().min(1).optional(),
  author: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().optional(),
  all: z.boolean().optional(),
  category: z.enum(["maintenance", "planning", "documentation", "refactor", "code review"]).optional(),
}).strict().superRefine((value, refinement) => {
  if (value.all === true && value.limit !== undefined) {
    refinement.addIssue({ code: "custom", message: "--all and --limit are mutually exclusive." });
  }
});

/** Registry contribution owned by standalone log inspection. */
export const logStandaloneInputRegistration = {
  commandPath: "log standalone",
  schema: LogStandaloneInputSchema,
} satisfies CommandInputRegistration;

export async function handleLogStandalone(opts: LogStandaloneOptions): Promise<void> {
  const parsed = LogStandaloneInputSchema.safeParse(opts);
  if (!parsed.success) {
    p.log.error(z.prettifyError(parsed.error));
    process.exitCode = 1;
    return;
  }
  try {
    const result = await runLogStandalone({
      exec: gitExec,
      since: parsed.data.since,
      author: parsed.data.author,
      limit: parsed.data.limit,
      all: parsed.data.all,
      category: parsed.data.category,
    });

    const output = buildLogStandaloneOutput(result);
    p.log.message(output);
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }
}
