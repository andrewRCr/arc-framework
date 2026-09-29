/** Test support for the injectable Git executor contracts. */

import { normalizeGitRejection } from "../../src/lib/git/process-error.js";
import type { GitProcessError } from "../../src/lib/git/process-error.js";
import type {
  ExecResult, GitExec, GitExecInput, GitExecOptions, RawGitExec, RawGitResult,
} from "../../src/lib/git/exec.js";

export type GitFailureEvidence = ({ exitCode: number } | { signal: string } |
  { isCanceled: true } | { timedOut: true }) & {
  stdout?: string | Uint8Array;
  stderr?: string;
};

/**
 * Build a typed executor failure from process-like evidence.
 * @param input - Invocation and observed process failure.
 * @returns The failure classified by the production normalizer.
 */
export function makeGitProcessError(input: {
  command: string;
  args: readonly string[];
} & GitFailureEvidence): GitProcessError {
  const { command, args, ...evidence } = input;
  return normalizeGitRejection(evidence, { command, args });
}

export interface GitExecCall {
  command: string;
  args: string[];
  options?: GitExecOptions;
}

export type GitArgsMatch = readonly string[] | { prefix: readonly string[] } | {
  predicate: (args: readonly string[], command: string) => boolean;
};

export type ScriptedGitResponse<TCall, TResult> = TResult | { failure: GitFailureEvidence } | (
  (call: TCall) => TResult | { failure: GitFailureEvidence } | Promise<TResult | { failure: GitFailureEvidence }>
);

export interface GitScriptEntry<TCall, TResult> {
  command?: string;
  match: GitArgsMatch;
  responses: readonly ScriptedGitResponse<TCall, TResult>[];
}

export type GitExecScriptEntry = GitScriptEntry<GitExecCall, ExecResult>;

function matches(match: GitArgsMatch, args: readonly string[], command: string): boolean {
  if (Array.isArray(match)) return args.length === match.length && match.every((arg, i) => arg === args[i]);
  if ("prefix" in match) return match.prefix.length <= args.length &&
    match.prefix.every((arg, i) => arg === args[i]);
  if ("predicate" in match) return match.predicate(args, command);
  return false;
}

function scriptResponse<TCall, TResult>(entries: readonly GitScriptEntry<TCall, TResult>[]) {
  const consumed = entries.map(() => 0);
  return async (command: string, args: readonly string[], call: TCall): Promise<TResult> => {
    const index = entries.findIndex((entry) =>
      (entry.command ?? "git") === command && matches(entry.match, args, command));
    const entry = entries[index];
    if (!entry) throw new Error(`Unscripted Git invocation: ${command} ${JSON.stringify(args)}`);
    if (entry.responses.length === 0) throw new Error(`Empty Git script: ${command} ${JSON.stringify(args)}`);
    const position = Math.min(consumed[index] ?? 0, entry.responses.length - 1);
    consumed[index] = (consumed[index] ?? 0) + 1;
    const scripted = entry.responses[position];
    const result = typeof scripted === "function"
      ? await (scripted as (call: TCall) => TResult | { failure: GitFailureEvidence })(call)
      : scripted;
    if (result && typeof result === "object" && "failure" in result) {
      throw makeGitProcessError({ command, args, ...result.failure });
    }
    return result as TResult;
  };
}

/**
 * Script a GitExec; every invocation must have a matching entry.
 * @param entries - Ordered command and argument scripts.
 * @returns The executor and its recorded calls.
 */
export function scriptGitExec(entries: readonly GitExecScriptEntry[]): {
  exec: GitExec;
  calls: GitExecCall[];
} {
  const calls: GitExecCall[] = [];
  const respond = scriptResponse(entries);
  const exec: GitExec = async (command, args, options) => {
    const call = { command, args: [...args], options };
    calls.push(call);
    return respond(command, args, call);
  };
  return { exec, calls };
}

export interface GitExecInputCall {
  args: string[];
  input: string;
  options?: Parameters<GitExecInput>[2];
}

export interface RawGitExecCall {
  args: string[];
  options?: Parameters<RawGitExec>[1];
}

export type GitExecInputScriptEntry = GitScriptEntry<GitExecInputCall, string>;
export type RawGitExecScriptEntry = GitScriptEntry<RawGitExecCall, RawGitResult>;

/**
 * Script the stdin-fed Git executor.
 * @param entries - Ordered argument scripts.
 * @returns The executor and its recorded calls.
 */
export function scriptGitExecInput(entries: readonly GitExecInputScriptEntry[]): {
  exec: GitExecInput;
  calls: GitExecInputCall[];
} {
  const calls: GitExecInputCall[] = [];
  const respond = scriptResponse(entries);
  const exec: GitExecInput = async (args, input, options) => {
    const call = { args: [...args], input, options };
    calls.push(call);
    return respond("git", args, call);
  };
  return { exec, calls };
}

/**
 * Script the byte-preserving Git executor.
 * @param entries - Ordered argument scripts.
 * @returns The executor and its recorded calls.
 */
export function scriptRawGitExec(entries: readonly RawGitExecScriptEntry[]): {
  exec: RawGitExec;
  calls: RawGitExecCall[];
} {
  const calls: RawGitExecCall[] = [];
  const respond = scriptResponse(entries);
  const exec: RawGitExec = async (args, options) => {
    const call = { args: [...args], options };
    calls.push(call);
    return respond("git", args, call);
  };
  return { exec, calls };
}
