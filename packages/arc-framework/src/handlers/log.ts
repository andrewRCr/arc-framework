/**
 * Handler for `arc log` subcommands.
 *
 * @module
 */

import * as p from "@clack/prompts";

import { runLogStandalone, buildLogStandaloneOutput } from "../commands/log.js";
import { gitExec } from "../lib/io-context.js";
import { isHandledError } from "./shared.js";

export interface LogStandaloneOptions {
  since?: string;
  author?: string;
  limit?: number;
  all?: boolean;
  category?: string;
}

export async function handleLogStandalone(opts: LogStandaloneOptions): Promise<void> {
  try {
    const result = await runLogStandalone({
      exec: gitExec,
      since: opts.since,
      author: opts.author,
      limit: opts.limit,
      all: opts.all,
      category: opts.category,
    });

    const output = buildLogStandaloneOutput(result);
    p.log.message(output);
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }
}
