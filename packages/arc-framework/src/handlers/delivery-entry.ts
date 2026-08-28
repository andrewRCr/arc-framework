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
  inspectDeliveryEntry,
  type DeliveryEntryInspectionResult,
} from "../lib/delivery/entry-inspection.js";
import { DeliveryPlanV1Codec } from "../lib/delivery/plan.js";
import {
  GitDeliveryRenameTransitionSource,
  resolveExistingDeliveryPlan,
} from "../lib/delivery/plan-resolution.js";
import { resolveExistingDeliveryAuthoringMap } from "../lib/delivery/authoring-resolution.js";
import { RepositoryDeliveryAuthoringStore } from "../lib/delivery/authoring-store.js";
import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../lib/delivery/local-stores.js";
import { RepositoryGitCommonStatePublisher } from "../lib/git-common-state.js";
import { createGitExec, createRawGitExec } from "../lib/io-context.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import { requireArcProjectRoot } from "./shared.js";

const InputSchema = z.union([
  z.strictObject({
    boundaryDisposition: z.enum(["not-delivery-candidate", "delivery-candidate"]),
    provisionalDisposition: z.enum(["not-applicable", "confirmed-reviewed"]),
  }),
  z.strictObject({ entryMode: z.literal("execution") }),
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
      mutationBoundary: "attended delivery entry input validation", subprocess: "explicit-stdin",
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
        mutationBoundary: "attended delivery entry request read", subprocess: "explicit-stdin",
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

/** Validate attended input and preserve the exact closed inspection route. */
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
    : target;
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

  const exec = createGitExec(interaction?.subprocess);
  const publisher = new RepositoryGitCommonStatePublisher(exec, cwd);
  const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const stateStore = new RepositoryDeliveryStateStore(publisher);
  const authoringStore = new RepositoryDeliveryAuthoringStore(publisher);
  const transitionSource = new GitDeliveryRenameTransitionSource(createRawGitExec(cwd));
  const { settings } = await readConfigSettings(cwd);
  const base = settings["branch.base"].trim();
  const authority = base === ""
    ? { status: "unestablished" as const }
    : { status: "established" as const, ref: `refs/heads/${base}` };

  return inspectDeliveryEntry(DeliveryEntryInspectionRequestSchema.parse({
    workUnitId: active.name,
    ...input,
  }), {
    readTaskList: () => readFile(taskListPath, "utf8"),
    resolvePlan: async () => {
      const result = await resolveExistingDeliveryPlan({
        planStore: { enumerateCurrent: () => planStore.enumerateCurrentReadOnly() },
        currentWorkUnitId: active.name, planWorkUnitId: (plan) => plan.workUnitId,
        authority, transitionSource,
      });
      return result.status === "match" ? result : { status: result.status };
    },
    resolveAuthoring: async () => {
      const result = await resolveExistingDeliveryAuthoringMap({
        store: { enumerate: () => authoringStore.enumerateReadOnly() },
        currentWorkUnitId: active.name, authority, transitionSource,
      });
      if (result.status === "match") {
        return {
          status: "match",
          mapId: result.record.snapshot.mapId,
          candidatePlanDigest: result.record.snapshot.candidatePlanDigest,
        };
      }
      return { status: result.status };
    },
    readState: async (planId) => {
      const result = await stateStore.read(planId);
      return result.status === "refused"
        ? { status: "refused", reason: result.reason }
        : result.value === null
          ? { status: "ok", value: null, revision: null }
          : { status: "ok", value: result.value.value, revision: result.value.revision };
    },
  });
}
