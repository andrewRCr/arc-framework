/**
 * Terminal presentation shared by handlers without exposing question acquisition.
 *
 * Clack writes to stdout unless told otherwise. Inside a machine-output scope every presentation call here writes to
 * stderr instead, so a command's machine-readable document is the only thing on its stdout. An output the caller
 * names explicitly is kept.
 */
import type { Writable } from "node:stream";

import * as clack from "@clack/prompts";

import { inMachineOutputScope } from "./machine-output-scope.js";

/** Point the options argument at stderr inside a machine-output scope, leaving the arguments untouched otherwise. */
function routed<Args extends unknown[]>(args: Args, optionsIndex: number): Args {
  if (!inMachineOutputScope()) return args;
  const options = args[optionsIndex] as { output?: Writable } | undefined;
  if (options?.output !== undefined) return args;
  const next: unknown[] = [...args];
  next[optionsIndex] = { ...options, output: process.stderr };
  return next as Args;
}

/** Clack's log, routed off stdout inside a machine-output scope. */
export const log = {
  message(...args: Parameters<typeof clack.log.message>): void {
    clack.log.message(...routed(args, 1));
  },
  info(...args: Parameters<typeof clack.log.info>): void {
    clack.log.info(...routed(args, 1));
  },
  success(...args: Parameters<typeof clack.log.success>): void {
    clack.log.success(...routed(args, 1));
  },
  step(...args: Parameters<typeof clack.log.step>): void {
    clack.log.step(...routed(args, 1));
  },
  warn(...args: Parameters<typeof clack.log.warn>): void {
    clack.log.warn(...routed(args, 1));
  },
  warning(...args: Parameters<typeof clack.log.warning>): void {
    clack.log.warning(...routed(args, 1));
  },
  error(...args: Parameters<typeof clack.log.error>): void {
    clack.log.error(...routed(args, 1));
  },
};

/** Clack's intro, routed off stdout inside a machine-output scope. */
export function intro(...args: Parameters<typeof clack.intro>): void {
  clack.intro(...routed(args, 1));
}

/** Clack's outro, routed off stdout inside a machine-output scope. */
export function outro(...args: Parameters<typeof clack.outro>): void {
  clack.outro(...routed(args, 1));
}

/** Clack's note, routed off stdout inside a machine-output scope. */
export function note(...args: Parameters<typeof clack.note>): void {
  clack.note(...routed(args, 2));
}

/** Clack's cancel, routed off stdout inside a machine-output scope. */
export function cancel(...args: Parameters<typeof clack.cancel>): void {
  clack.cancel(...routed(args, 1));
}

/** Clack's spinner, routed off stdout inside a machine-output scope. */
export function spinner(...args: Parameters<typeof clack.spinner>): ReturnType<typeof clack.spinner> {
  return clack.spinner(...routed(args, 0));
}
