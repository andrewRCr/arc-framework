/** CLI adapter for the exact-effect Errand terminal merge. */

import { readFile } from "node:fs/promises";

import { z } from "zod";

import {
  declareCliOperandSite,
  declareCliOptionSite,
  declareInteractionSite,
  type CommandInputDeclaration,
} from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { resolveIdentity } from "../lib/git/index.js";
import { createGitExec } from "../lib/io-context.js";
import { SlugSchema } from "../lib/kernel/schema/slug.js";
import { resolveArcRoot } from "../lib/paths.js";
import {
  errandMergeOperationRefusal,
  ErrandMergeRequestSchema,
  ErrandMergeResultSchema,
  mergeErrand,
  type ErrandMergeRequest,
  type ErrandMergeResult,
} from "../scripts/integration/errand-merge.js";
import { createErrandMergeDependencies } from "../scripts/integration/errand-merge-composition.js";
import { SpineRemedySchema, spineRemedy } from "../scripts/integration/spine-refusal.js";

export const ErrandMergeCommandInputSchema = z.strictObject({
  slug: SlugSchema,
  input: z.string().trim().min(1),
  json: z.boolean().optional(),
});

const ErrandMergeInputRefusalSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal("errand-merge"),
  state: z.literal("refused"),
  nextAction: z.literal("stop"),
  reason: z.literal("invalid-input"),
  detail: z.string().trim().min(1),
  identity: z.null(),
  approvedTarget: z.null(),
  lane: z.null(),
  coordinates: z.strictObject({ observedTarget: z.null(), observedBaseOid: z.null() }),
  continuation: z.strictObject({ kind: z.literal("remedy"), remedy: SpineRemedySchema }),
});

export const ErrandMergeCommandResultSchema = z.union([
  ErrandMergeResultSchema,
  ErrandMergeInputRefusalSchema,
]);
export type ErrandMergeCommandResult = z.infer<typeof ErrandMergeCommandResultSchema>;

export const errandMergeCommandInputRegistration = {
  commandPath: "errand merge",
  schema: ErrandMergeCommandInputSchema,
  schemaFields: { "operand.slug": "slug", "operand.input": "input", "option.json": "json" },
} satisfies CommandInputRegistration;

export const errandMergeCommandInputPolicyDeclarations = [{
  commandPath: "errand merge",
  aliases: [],
  sites: [
    declareCliOperandSite("slug", {
      acquisition: "parser-required", schemaOwnership: "owned", schemaField: "slug",
      cancellation: "not-applicable",
      automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["<slug>"] },
      mutationBoundary: "Errand merge identity selection", subprocess: "none",
    }),
    declareCliOperandSite("input", {
      acquisition: "handler-required", schemaOwnership: "owned", schemaField: "input",
      cancellation: "not-applicable",
      automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["<json-path>", "-"] },
      mutationBoundary: "exact Errand merge request validation", subprocess: "explicit-stdin",
    }),
    declareCliOptionSite("json", {
      acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json",
      cancellation: "not-applicable",
      automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection", subprocess: "none",
    }),
    declareInteractionSite(
      { file: "handlers/errand-merge.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence: 1 },
      {
        acquisition: "explicit-stdin", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] },
        mutationBoundary: "exact Errand merge request read", subprocess: "explicit-stdin",
      },
    ),
  ],
}] satisfies readonly CommandInputDeclaration[];

export interface ErrandMergeOptions { readonly json?: boolean }

export interface ErrandMergeHandlerDependencies {
  readonly readText: (source: string) => Promise<string>;
  readonly resolveRoot: () => string | null;
  readonly resolveIdentity: () => Promise<string | null>;
  readonly merge: (root: string, identity: string, request: ErrandMergeRequest) => Promise<ErrandMergeResult>;
  readonly write: (text: string, stream: "stdout" | "stderr") => void;
  readonly setExitCode: (code: number) => void;
}

export interface ErrandMergeFormattedResult {
  readonly stream: "stdout" | "stderr";
  readonly text: string;
  readonly exitCode: number;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function stableFailureDetail(error: unknown): string {
  const detail = (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, " ").trim();
  return detail.slice(0, 1_024) || "The Errand merge operation failed without diagnostic detail.";
}

function inputRefusal(detail: string): ErrandMergeCommandResult {
  return ErrandMergeCommandResultSchema.parse({
    schemaVersion: 1,
    mode: "errand-merge",
    state: "refused",
    nextAction: "stop",
    reason: "invalid-input",
    detail,
    identity: null,
    approvedTarget: null,
    lane: null,
    coordinates: { observedTarget: null, observedBaseOid: null },
    continuation: {
      kind: "remedy",
      remedy: spineRemedy(
        "Errand merge requires a valid slug and exact request envelope.",
        "Review command usage",
        ["arc", "errand", "merge", "--help"],
      ),
    },
  });
}

function renderArgument(value: string): string {
  return /^[A-Za-z0-9_./:@+-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", `'"'"'`)}'`;
}

function defaultDependencies(
  interaction: InteractionContext | undefined,
): ErrandMergeHandlerDependencies {
  const exec = createGitExec(interaction?.subprocess);
  return {
    readText: (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    resolveRoot: () => resolveArcRoot(),
    resolveIdentity: () => resolveIdentity({ exec }),
    merge: (root, identity, request) => mergeErrand(
      request,
      createErrandMergeDependencies({
        cwd: root,
        exec,
        identity,
        slug: request.identity.slug,
      }),
    ),
    write: (text, stream) => {
      const output = text.endsWith("\n") ? text : `${text}\n`;
      if (stream === "stdout") process.stdout.write(output);
      else process.stderr.write(output);
    },
    setExitCode: (code) => { process.exitCode = code; },
  };
}

/** Format one validated Errand merge result. */
export function formatErrandMergeResult(
  result: ErrandMergeCommandResult,
  json: boolean,
): ErrandMergeFormattedResult {
  if (json) {
    return {
      stream: "stdout",
      text: `${JSON.stringify(ErrandMergeCommandResultSchema.parse(result))}\n`,
      exitCode: result.state === "refused" ? 64 : result.state === "operation-failed" ? 1 : 0,
    };
  }
  if (result.state === "merged") {
    return {
      stream: "stdout",
      text: `merged: exact approved Errand target\nNext: ${result.nextAction}`,
      exitCode: 0,
    };
  }
  const continuation = result.continuation.kind === "remedy"
    ? `Run: ${result.continuation.remedy.argv.map(renderArgument).join(" ")}`
    : `Explanation: ${result.continuation.terminalExplanation}`;
  return {
    stream: "stderr",
    text: [`${result.state}: ${result.detail}`, `Next: ${result.nextAction}`, continuation].join("\n"),
    exitCode: result.state === "refused" ? 64 : result.state === "operation-failed" ? 1 : 0,
  };
}

/** Validate and execute one exact Errand merge request. */
export async function handleErrandMerge(
  slug: string,
  input: string,
  options: ErrandMergeOptions,
  interaction?: InteractionContext,
  overrides: Partial<ErrandMergeHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies(interaction), ...overrides };
  const emit = (result: ErrandMergeCommandResult): void => {
    const formatted = formatErrandMergeResult(result, options.json === true);
    dependencies.write(formatted.text, formatted.stream);
    dependencies.setExitCode(formatted.exitCode);
  };
  const command = ErrandMergeCommandInputSchema.safeParse({ slug, input, json: options.json });
  if (!command.success) {
    emit(inputRefusal(command.error.issues.map(({ message }) => message).join("; ")));
    return;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(await dependencies.readText(command.data.input));
  } catch (error) {
    emit(inputRefusal(`The request could not be read as JSON: ${stableFailureDetail(error)}`));
    return;
  }
  const request = ErrandMergeRequestSchema.safeParse(decoded);
  if (!request.success || request.data.identity.slug !== command.data.slug) {
    emit(inputRefusal(request.success
      ? "The command slug does not match the request identity."
      : request.error.issues.map(({ message }) => message).join("; ")));
    return;
  }
  const root = dependencies.resolveRoot();
  if (root === null) {
    emit(errandMergeOperationRefusal(request.data, "Not inside an ARC project."));
    return;
  }
  let identity: string | null;
  try {
    identity = await dependencies.resolveIdentity();
  } catch (error) {
    emit(errandMergeOperationRefusal(request.data, stableFailureDetail(error)));
    return;
  }
  if (identity === null) {
    emit(errandMergeOperationRefusal(request.data, "No ARC identity is configured."));
    return;
  }
  try {
    emit(ErrandMergeResultSchema.parse(await dependencies.merge(root, identity, request.data)));
  } catch (error) {
    emit(errandMergeOperationRefusal(request.data, stableFailureDetail(error)));
  }
}
