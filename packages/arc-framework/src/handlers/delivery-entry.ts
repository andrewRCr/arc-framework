/** CLI adapter and repository composition for read-only delivery entry inspection. */

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { z } from "zod";

import { parseMetaFile } from "../lib/active/meta-reader.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import {
  declareCliOptionSite,
  declareInteractionSite,
  type CommandInputDeclaration,
} from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import {
  DeliveryEntryInspectionResultSchema,
  DeliveryEntryInspectionRequestSchema,
  type DeliveryEntryInspectionResult,
} from "../lib/delivery/entry-inspection.js";
import { inspectRepositoryDeliveryEntry as inspectRepositoryDeliveryEntryAt } from
  "../lib/delivery/repository-entry.js";
import { createGitExec } from "../lib/io-context.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import { requireArcProjectRoot } from "./shared.js";

const InputSchema = z.union([
  z.strictObject({
    boundaryDisposition: z.enum(["not-delivery-candidate", "delivery-candidate"]),
    provisionalDisposition: z.enum(["not-applicable", "confirmed-reviewed"]),
  }),
  z.strictObject({ entryMode: z.enum(["execution", "integrating", "prepublication"]) }),
]);
const OptionsSchema = z.strictObject({ input: z.string().min(1), json: z.boolean().optional() });

export interface DeliveryEntryInspectOptions { readonly input?: string; readonly json?: boolean }

export const deliveryEntryCommandInputRegistration = {
  commandPath: "delivery entry inspect",
  schema: OptionsSchema,
  schemaFields: { "option.input": "input", "option.json": "json" },
} as const satisfies CommandInputRegistration;

export const deliveryEntryCommandInputPolicyDeclarations = [{
  commandPath: "delivery entry inspect",
  aliases: [],
  sites: [
    declareCliOptionSite("input", {
      acquisition: "handler-required", schemaOwnership: "owned", schemaField: "input",
      cancellation: "not-applicable",
      automation: { noInput: "read-explicit-stdin", flags: ["--input"], acceptedSyntax: ["--input <json-path>", "--input -"] },
      mutationBoundary: "delivery entry context validation", subprocess: "explicit-stdin",
    }),
    declareCliOptionSite("json", {
      acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json",
      cancellation: "not-applicable", automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection", subprocess: "none",
    }),
    declareInteractionSite(
      { file: "handlers/delivery-entry.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence: 1 },
      {
        acquisition: "explicit-stdin", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] },
        mutationBoundary: "delivery entry request read", subprocess: "explicit-stdin",
      },
    ),
  ],
}] as const satisfies readonly CommandInputDeclaration[];

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface DeliveryEntryInspectHandlerDependencies {
  readonly readText: (source: string) => Promise<string>;
  readonly inspect: (
    input: z.infer<typeof InputSchema>,
    interaction?: InteractionContext,
  ) => Promise<DeliveryEntryInspectionResult>;
  readonly write: (text: string) => void;
  readonly setExitCode: (code: number) => void;
}

function defaultDependencies(): DeliveryEntryInspectHandlerDependencies {
  return {
    readText: (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    inspect: inspectRepositoryDeliveryEntry,
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
  };
}

function emit(
  dependencies: DeliveryEntryInspectHandlerDependencies,
  result: DeliveryEntryInspectionResult | { readonly status: "refused"; readonly reason: string },
): void {
  dependencies.write(`${JSON.stringify({
    schemaVersion: 1,
    command: "delivery entry inspect",
    ...result,
  })}\n`);
  if (result.status === "refused") dependencies.setExitCode(1);
}

/** Validate the closed entry context and preserve the exact inspection route. */
export async function handleDeliveryEntryInspect(
  opts: DeliveryEntryInspectOptions,
  interaction?: InteractionContext,
  overrides: Partial<DeliveryEntryInspectHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies(), ...overrides };
  const options = OptionsSchema.safeParse(opts);
  if (!options.success) {
    emit(dependencies, { status: "refused", reason: "invalid-command-input" });
    return;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(await dependencies.readText(options.data.input));
  } catch {
    emit(dependencies, { status: "refused", reason: "invalid-command-input" });
    return;
  }
  const input = InputSchema.safeParse(decoded);
  if (!input.success) {
    emit(dependencies, { status: "refused", reason: "invalid-command-input" });
    return;
  }
  try {
    const result = DeliveryEntryInspectionResultSchema.safeParse(
      await dependencies.inspect(input.data, interaction),
    );
    emit(dependencies, result.success
      ? result.data
      : { status: "refused", reason: "invalid-service-result" });
  } catch {
    emit(dependencies, { status: "refused", reason: "inspection-unavailable" });
  }
}

function resolveTaskListPath(cwd: string, activePath: string, taskList: string): string | null {
  const target = taskList.includes("/")
    ? resolve(cwd, taskList)
    : resolve(cwd, dirname(activePath), taskList);
  const relation = relative(cwd, target).replaceAll("\\", "/");
  return relation === "" || relation === ".." || relation.startsWith("../") || isAbsolute(relation)
    ? null
    : relation;
}

async function inspectRepositoryDeliveryEntry(
  input: z.infer<typeof InputSchema>,
  interaction?: InteractionContext,
): Promise<DeliveryEntryInspectionResult> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) throw new Error("ARC project root unavailable");
  const active = await resolveActiveWu({ cwd });
  if (active.status !== "resolved" || active.name === "") throw new Error("Active work unit unavailable");
  const parsedMeta = parseMetaFile(await readFile(resolve(cwd, active.path), "utf8"));
  if (parsedMeta.taskList === null || parsedMeta.taskList === "[none]") {
    throw new Error("Task list unavailable");
  }
  const taskListPath = resolveTaskListPath(cwd, active.path, parsedMeta.taskList);
  if (taskListPath === null) throw new Error("Task list path invalid");
  const { settings } = await readConfigSettings(cwd);

  return inspectRepositoryDeliveryEntryAt({
    cwd,
    taskListPath,
    request: DeliveryEntryInspectionRequestSchema.parse({ workUnitId: active.name, ...input }),
    baseBranch: settings["branch.base"],
    exec: createGitExec(interaction?.subprocess),
  });
}
