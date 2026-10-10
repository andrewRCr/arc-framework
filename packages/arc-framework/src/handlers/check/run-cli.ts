/** Commander and process boundary for declared check requests. */
import { z } from "zod";
import { execa } from "execa";
import { access, readFile } from "node:fs/promises";
import { detectHookManager } from "../../lib/hook-manager.js";
import { resolve } from "node:path";
import type { GitExec } from "../../lib/git/exec.js";
import { normalizeGitRejection } from "../../lib/git/process-error.js";
import { availableParallelism } from "node:os";
import { atomicCreateFile, atomicWriteFile } from "../../lib/fs.js";
import { createCheckReportStore } from "../../lib/checks/reports.js";
import { checkRecordDirectory, createCheckPassStore } from "../../lib/checks/record.js";
import { CheckDeclarationSchema } from "../../lib/checks/declaration.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { readTypedProjectFile } from "../../lib/config/typed-file-reader.js";
import { createGitExec } from "../../lib/io-context.js";
import { createExecaGitExecInput, environmentForGitCwd } from "../../lib/git/process-executor.js";
import type { InteractionContext } from "../../lib/command-input/interaction-context.js";
import { declaredChecksExitCode, runDeclaredRequest, type RunDeclaredChecksResult, type CheckContentContext } from "./run.js";
import { isCheckHookForm, type CheckForm, type CheckRequest } from "../../lib/checks/request.js";
import { classifyPushRef, readPushEvent, type PushEvent } from "../../lib/checks/push.js";
import { checkVerification } from "./report.js";
import { renderDeclaredChecks } from "./run-output.js";

import { CheckIncrementInputSchema, CheckPreCommitInputSchema, CheckPrePushInputSchema, CheckGateInputSchema, CheckRunInputSchema,
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
    report({ kind: "error", exitCode: 2, error: { kind: "usage", code: "input.invalid", message: `Unknown gate ${gate}; use commit, push, or merge and retry.` } }, options.json === true);
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

/**
 * Read and execute the push event supplied by Git or its hook manager.
 * @param remote - Positional remote name
 * @param url - Positional remote URL
 * @param options - Hook output and execution options
 * @param interaction - Invocation-bound process policy
 * @returns Resolves after reporting the pushed range
 */
export async function handleCheckPrePush(remote: string, url: string, options: CheckIncrementOptions, interaction: InteractionContext): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    if (!process.stdin.isTTY) for await (const chunk of process.stdin as AsyncIterable<Buffer>) chunks.push(chunk);
    const event = readPushEvent(Buffer.concat(chunks).toString("utf8"), remote, url, process.env);
    report(await runPushEvent(event, options, interaction), options.json === true);
  } catch (error) {
    report({ kind: "error", exitCode: 2, error: { kind: "refused", message: String(error) } }, options.json === true);
  }
}

async function runPushEvent(event: PushEvent, options: CheckIncrementOptions, interaction: InteractionContext): Promise<RunDeclaredChecksResult> {
  const checks: Extract<RunDeclaredChecksResult, { kind: "result" }>["result"]["checks"] = [];
  const git = createGitExec(interaction.subprocess);
  const root = (await git("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })).stdout;
  const currentRef = await currentPushRef(git, root);
  const pushRefs = event.refs.map(ref => classifyPushRef(ref, currentRef));
  let last: Extract<RunDeclaredChecksResult, { kind: "result" }>["result"] | undefined;
  for (const [index, ref] of event.refs.entries()) {
    if (pushRefs[index]?.outcome !== "checked") continue;
    const outcome = await runDeclaredCliRequest(options, interaction, { kind: "pre-push", ref: ref.localRef,
      tip: ref.localOid ?? ref.localRef, old: ref.remoteOid, remote: event.remote, url: event.url });
    if (outcome.kind === "error") return { ...outcome, error: { ...outcome.error, message: `${ref.localRef}: ${outcome.error.message}` } };
    last = outcome.result;
    checks.push(...last.checks);
  }
  return { kind: "result", exitCode: declaredChecksExitCode(checks), result: {
    ...(last ?? { status: "completed" }), checks, pushRefs,
    verification: last === undefined ? "Checks: no refs selected." : checkVerification(last.status, checks),
  } };
}

async function currentPushRef(git: GitExec, root: string): Promise<string | null> {
  const args = ["symbolic-ref", "--quiet", "HEAD"];
  try {
    return (await git("git", args, { cwd: root, preserveOutput: true })).stdout.replace(/\r?\n$/u, "");
  } catch (cause) {
    const failure = normalizeGitRejection(cause, { command: "git", args });
    if (failure.kind === "nonzero-exit" && failure.exitCode === 1 && failure.signal === undefined) return null;
    throw new Error("Could not resolve the checkout branch; repair its HEAD and retry git push.", { cause });
  }
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
    case "pre-push": return CheckPrePushInputSchema.safeParse({ ...options, remote: form.remote ?? "", url: form.url ?? "" });
    case "increment": return CheckIncrementInputSchema.safeParse(options);
  }
}

async function handleDeclaredRequest(options: CheckScopeOptions, interaction: InteractionContext, form: CheckForm): Promise<void> {
  report(await runDeclaredCliRequest(options, interaction, form), options.json === true);
}

async function runDeclaredCliRequest(options: CheckScopeOptions, interaction: InteractionContext, form: CheckForm): Promise<RunDeclaredChecksResult> {
  const parsed = parseRequestOptions(options, form);
  if (!parsed.success) {
    return { kind: "error", exitCode: 2, error: { kind: "usage", code: "input.invalid", message: parsed.error.message } };
  }
  const input = parsed.data;
  const git = createGitExec(interaction.subprocess);
  let outcome: RunDeclaredChecksResult;
  try {
    const root = (await git("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })).stdout;
    const inheritedIndex = process.env.GIT_INDEX_FILE;
    const hookSkip = isCheckHookForm(form) ? process.env.ARC_SKIP?.split(",").map(id => id.trim()).filter(Boolean) : undefined;
    const hookFixesFail = form.kind === "pre-commit"
      && (process.env.PRE_COMMIT !== undefined || (await detectHookManager(root, access))?.manager === "lefthook");
    outcome = await runDeclaredRequest(root, {
      platform: process.platform,
      availableParallelism,
      git, gitInput: createExecaGitExecInput(undefined, interaction.subprocess),
      passes: createCheckPassStore({ directory: () => checkRecordDirectory(git, root),
        readFile: path => readFile(path, "utf8"), createFile: atomicCreateFile }),
      reports: createCheckReportStore({ directory: () => checkRecordDirectory(git, root),
        readFile: path => readFile(path, "utf8"), writeFile: atomicWriteFile }),
      readDeclaration: repository => readTypedProjectFile(repository, "check-declaration", CheckDeclarationSchema),
      execute: runCheckProcess,
      runtime: (command, cwd) => runCheckProcess(command, cwd, undefined, { rawStdout: true }),
    }, { form, skip: hookSkip, hookFixesFail, baseBranch: (await readConfigSettings(root)).settings["branch.base"], scope: scopeRequest(input), force: input.force, dryRun: input.dryRun, serial: input.serial, ci: "ci" in input && input.ci === true, ...(form.kind === "pre-commit" && inheritedIndex !== undefined ? { indexFile: resolve(root, inheritedIndex) } : {}) });
  } catch (error) {
    outcome = { kind: "error", exitCode: 2, error: { kind: "refused", message: String(error) } };
  }
  return outcome;
}

function report(outcome: RunDeclaredChecksResult, json: boolean): void {
  const rendered = renderDeclaredChecks(outcome, json);
  if (outcome.kind === "error" && !json) process.stderr.write(rendered);
  else process.stdout.write(rendered);
  process.exitCode = outcome.exitCode;
}


function checkEnvironment(cwd: string, content?: CheckContentContext, indexFile?: string): NodeJS.ProcessEnv {
  const env = { ...(environmentForGitCwd(cwd) ?? process.env) };
  delete env.ARC_CHECK_BASE;
  delete env.ARC_CHECK_TREE;
  delete env.ARC_CHECK_MERGED;
  if (indexFile !== undefined) env.GIT_INDEX_FILE = indexFile;
  if (content !== undefined) {
    env.ARC_CHECK_TREE = content.tree;
    if (content.base !== undefined) env.ARC_CHECK_BASE = content.base;
    if (content.merged?.length) env.ARC_CHECK_MERGED = content.merged.join(" ");
  }
  return env;
}


async function runCheckProcess(command: readonly string[], cwd: string, content?: CheckContentContext, policy: { shell?: boolean; rawStdout?: boolean; indexFile?: string } = {}) {
  const result = await execa(command[0] ?? "", command.slice(1), {
    cwd, env: checkEnvironment(cwd, content, policy.indexFile), extendEnv: false, stdin: "ignore", reject: false,
    shell: policy.shell ?? false, stripFinalNewline: !policy.rawStdout,
  });
  const started = result.exitCode !== undefined || result.signal !== undefined;
  return { started, exitCode: result.exitCode ?? 1, stdout: result.stdout,
    output: [result.stdout, result.stderr, ...(!started ? [result.originalMessage] : [])].filter(Boolean).join("\n") };
}
