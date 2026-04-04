/**
 * Handler for `arc log` subcommands.
 *
 * @module
 */

import * as p from "@clack/prompts";

import { runLogAtomic, buildLogAtomicOutput } from "../commands/log.js";
import { gitExec } from "../lib/io-context.js";
import { isHandledError } from "./shared.js";

export interface LogAtomicOptions {
  since?: string;
  author?: string;
  limit?: number;
  all?: boolean;
  workUnit?: string;
}

export async function handleLogAtomic(opts: LogAtomicOptions): Promise<void> {
  try {
    const result = await runLogAtomic({
      exec: gitExec,
      since: opts.since,
      author: opts.author,
      limit: opts.limit,
      all: opts.all,
      workUnit: opts.workUnit,
    });

    const output = buildLogAtomicOutput(result);
    p.log.message(output);
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }
}
