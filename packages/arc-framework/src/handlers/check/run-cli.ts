/** Commander and process boundary for declared check requests. */
import { z } from "zod";
import { execa } from "execa";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { atomicCreateFile } from "../../lib/fs.js";
import { checkRecordDirectory, createCheckPassStore } from "../../lib/checks/record.js";
import { CheckDeclarationSchema } from "../../lib/checks/declaration.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { readTypedProjectFile } from "../../lib/config/typed-file-reader.js";
import { createGitExec } from "../../lib/io-context.js";
import { createExecaGitExecInput, environmentForGitCwd } from "../../lib/git/process-executor.js";
import type { InteractionContext } from "../../lib/command-input/interaction-context.js";
import { runDeclaredRequest, type RunDeclaredChecksResult } from "./run.js";
import type { CheckForm, CheckRequest } from "../../lib/checks/request.js";
import { renderDeclaredChecks } from "./run-output.js";

import { CheckIncrementInputSchema, CheckPreCommitInputSchema, CheckGateInputSchema, CheckRunInputSchema,
  CheckSegmentInputSchema, CheckNewHeadInputSchema, type CheckScopeOptions, type CheckIncrementOptions } from "./request-input.js";
export type { CheckIncrementOptions, CheckScopeOptions } from "./request-input.js";

/**
 * Execute an increment request through real repository I/O.
 * @param options - Commander output options
 * @param interaction - Invocation-bound process policy
 * @returns Resolves after writing output and assigning process exit state
 */
export async function handleCheckIncrement(options: CheckIncrementOptions, interaction: InteractionContext): Promise<void> {
  return handleDeclaredRequest(options, interaction, { kind: "increment" });
}

/**
 * Execute the index-based request through real repository I/O.
 * @param options - Commander output and force options
 * @param interaction - Invocation-bound process policy
 * @returns Resolves after writing output and assigning process exit state
 */
export async function handleCheckPreCommit(options: CheckIncrementOptions, interaction: InteractionContext): Promise<void> {
  return handleDeclaredRequest(options, interaction, { kind: "pre-commit" });
}

/**
 * Execute explicitly named checks through real repository I/O.
 * @param ids - Declared identifiers
 * @param options - Output and reuse options
 * @param interaction - Process interaction policy
 * @returns Resolves after reporting the request
 */
export async function handleCheckRun(ids: string[], options: CheckScopeOptions, interaction: InteractionContext): Promise<void> {
  return handleDeclaredRequest(options, interaction, { kind: "run", ids });
}

/**
 * Execute a named gate through real repository I/O.
 * @param gate - Requested gate name
 * @param options - Scope, output, and reuse options
 * @param interaction - Invocation process policy
 * @returns Resolves after reporting the request
 */
export async function handleCheckGate(gate: string, options: CheckScopeOptions, interaction: InteractionContext): Promise<void> {
  const parsed = z.enum(["commit", "push", "merge"]).safeParse(gate);
  if (!parsed.success) {
    report({ kind: "error", exitCode: 2, error: { kind: "refused", message: `Unknown gate ${gate}; use commit, push, or merge and retry.` } }, options.json === true);
    return;
  }
  return handleDeclaredRequest(options, interaction, { kind: "gate", gate: parsed.data });
}

/**
 * Execute the segment preset through repository I/O.
 * @param options - Output and reuse options
 * @param interaction - Invocation process policy
 * @returns Resolves after reporting the request
 */
export async function handleCheckSegment(options: CheckIncrementOptions, interaction: InteractionContext): Promise<void> {
  return handleDeclaredRequest(options, interaction, { kind: "segment" });
}

/**
 * Execute the new-head preset from an explicit earlier ref.
 * @param options - Earlier ref and output options
 * @param interaction - Invocation process policy
 * @returns Resolves after reporting the request
 */
export async function handleCheckNewHead(options: CheckIncrementOptions & { from: string }, interaction: InteractionContext): Promise<void> {
  const { from, ...common } = options;
  return handleDeclaredRequest(common, interaction, { kind: "new-head", from });
}

function scopeRequest(input: CheckScopeOptions): CheckRequest["scope"] {
  if (input.staged) return { kind: "staged" };
  if (input.changed) return { kind: "changed" };
  if (input.all) return { kind: "all" };
  if (input.paths) return { kind: "paths", paths: input.paths };
  if (input.range !== undefined) return { kind: "range", ...(typeof input.range === "string" ? { base: input.range } : {}) };
  return undefined;
}

function parseRequestOptions(options: CheckScopeOptions, form: CheckForm) {
  switch (form.kind) {
    case "gate": return CheckGateInputSchema.safeParse({ ...options, gate: form.gate });
    case "run": return CheckRunInputSchema.safeParse({ ...options, ids: form.ids });
    case "new-head": return CheckNewHeadInputSchema.safeParse({ ...options, from: form.from });
    case "segment": return CheckSegmentInputSchema.safeParse(options);
    case "pre-commit": return CheckPreCommitInputSchema.safeParse(options);
    case "increment": return CheckIncrementInputSchema.safeParse(options);
  }
}

async function handleDeclaredRequest(options: CheckScopeOptions, interaction: InteractionContext, form: CheckForm): Promise<void> {
  const parsed = parseRequestOptions(options, form);
  if (!parsed.success) {
    report({ kind: "error", exitCode: 2, error: { kind: "refused", message: parsed.error.message } }, options.json === true);
    return;
  }
  const input = parsed.data;
  const git = createGitExec(interaction.subprocess);
  let outcome: RunDeclaredChecksResult;
  try {
    const root = (await git("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })).stdout;
    const inheritedIndex = process.env.GIT_INDEX_FILE;
    outcome = await runDeclaredRequest(root, {
      git, gitInput: createExecaGitExecInput(undefined, interaction.subprocess),
      passes: createCheckPassStore({ directory: () => checkRecordDirectory(git, root),
        readFile: path => readFile(path, "utf8"), createFile: atomicCreateFile }),
      readDeclaration: repository => readTypedProjectFile(repository, "check-declaration", CheckDeclarationSchema),
      execute: async (command, cwd) => {
        const result = await execa(command[0] ?? "", command.slice(1), {
          cwd, env: environmentForGitCwd(cwd), extendEnv: false, stdin: "ignore", reject: false,
        });
        return { exitCode: result.exitCode ?? 1, output: [result.stdout, result.stderr].filter(Boolean).join("\n") };
      },
    }, { form, baseBranch: (await readConfigSettings(root)).settings["branch.base"], scope: scopeRequest(input), force: input.force, dryRun: input.dryRun, serial: input.serial, ci: "ci" in input && input.ci === true, ...(form.kind === "pre-commit" && inheritedIndex !== undefined ? { indexFile: resolve(root, inheritedIndex) } : {}) });
  } catch (error) {
    outcome = { kind: "error", exitCode: 2, error: { kind: "refused", message: String(error) } };
  }
  report(outcome, input.json === true);
}

function report(outcome: RunDeclaredChecksResult, json: boolean): void {
  const rendered = renderDeclaredChecks(outcome, json);
  if (outcome.kind === "error" && !json) process.stderr.write(rendered);
  else process.stdout.write(rendered);
  process.exitCode = outcome.exitCode;
}
