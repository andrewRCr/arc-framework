/** CLI adapters for the delivery authoring spine. */

import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { z } from "zod";

import { parseMetaFile, parseMetaRecord } from "../lib/active/meta-reader.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { DeliveryPlanComposer } from "../lib/delivery/compose.js";
import {
  DELIVERY_DESIGN_INVENTORY_INPUT_SCHEMA_ID,
  DELIVERY_DESIGN_INVENTORY_INPUT_SCHEMA_VERSION,
  registerDeliveryAuthoringSchemas,
  type BoundDesignInventory,
} from "../lib/delivery/design-inventory.js";
import {
  prepareDeliveryFromBranchAuthoring,
  resolveDeliveryFromBranchProjection,
  resolveDeliveryFromBranchSourceAdvisories,
} from "../lib/delivery/from-branch.js";
import {
  prepareDeliveryFromTasksAuthoring,
  revalidateDeliveryFromTasksPhaseFacts,
  resolveDeliveryFromTasksProjection,
} from "../lib/delivery/from-tasks.js";
import { DeliveryPlanV1Codec } from "../lib/delivery/plan.js";
import {
  DeliveryAuthoringManager,
  resolveExistingDeliveryAuthoringMap,
} from "../lib/delivery/authoring-resolution.js";
import { validateDeliveryAuthoringMap } from "../lib/delivery/authoring-map.js";
import { RepositoryDeliveryAuthoringStore } from "../lib/delivery/authoring-store.js";
import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../lib/delivery/local-stores.js";
import {
  GitDeliveryRenameTransitionSource,
  resolveExistingDeliveryPlan,
} from "../lib/delivery/plan-resolution.js";
import {
  DeliveryCanonicalDigestSchema,
  registerDeliveryDomainSchemas,
  type DeliveryPlanV1,
} from "../lib/delivery/schema.js";
import { RepositoryGitCommonStatePublisher } from "../lib/git-common-state.js";
import {
  assertCanonicalDigest,
  canonicalize,
  createKernelRegistry,
  type CanonicalDigest,
} from "../lib/kernel/index.js";
import { projectKernelSchemas } from "../lib/kernel/schema/generate.js";
import { createGitExec, createRawGitExec } from "../lib/io-context.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import {
  buildDeliveryTaskInventory,
  type DeliveryTaskInventory,
} from "../lib/delivery/task-inventory.js";
import { RepositoryDeliveryTaskListRenderer } from "../lib/delivery/task-list-render.js";
import { requireArcProjectRoot } from "./shared.js";

const DeliveryPlanFromTasksInputSchema = z.strictObject({
  designInventory: z.string().trim().min(1),
  taskList: z.string().trim().min(1).optional(),
  json: z.boolean().optional(),
});
const DeliveryPlanFromBranchInputSchema = z.strictObject({
  designInventory: z.string().trim().min(1),
  base: z.string().trim().min(1).optional(),
  head: z.string().trim().min(1).optional(),
  json: z.boolean().optional(),
});
const DeliveryComposeInputSchema = z.strictObject({
  landedPrefix: z.string().trim().min(1).optional(),
  json: z.boolean().optional(),
});
const DeliveryPlanAbandonInputSchema = z.strictObject({ json: z.boolean().optional() });
const DeliveryPlanInventorySchemaInputSchema = z.strictObject({ json: z.boolean().optional() });
const FromTasksSourceInputsSchema = z.strictObject({ taskListPath: z.string().min(1) });
const FromBranchSourceInputsSchema = z.strictObject({
  taskListPath: z.string().min(1),
  base: z.string().min(1),
  head: z.string().min(1),
});

export interface DeliveryPlanFromTasksOptions {
  readonly designInventory?: string;
  readonly taskList?: string;
  readonly json?: boolean;
}
export interface DeliveryPlanFromBranchOptions {
  readonly designInventory?: string;
  readonly base?: string;
  readonly head?: string;
  readonly json?: boolean;
}
export interface DeliveryComposeOptions {
  readonly landedPrefix?: string;
  readonly json?: boolean;
}
export interface DeliveryPlanAbandonOptions { readonly json?: boolean }
export interface DeliveryPlanInventorySchemaOptions { readonly json?: boolean }

/** Command-input schema owned by the value-taking task-list authoring command. */
export const deliveryCommandInputRegistrations = [
  {
    commandPath: "delivery plan from-tasks",
    schema: DeliveryPlanFromTasksInputSchema,
    schemaFields: {
      "option.designInventory": "designInventory",
      "option.task-list": "taskList",
      "option.json": "json",
    },
  },
  {
    commandPath: "delivery plan from-branch",
    schema: DeliveryPlanFromBranchInputSchema,
    schemaFields: {
      "option.designInventory": "designInventory",
      "option.base": "base",
      "option.head": "head",
      "option.json": "json",
    },
  },
  {
    commandPath: "delivery compose",
    schema: DeliveryComposeInputSchema,
    schemaFields: {
      "option.landed-prefix": "landedPrefix",
      "option.json": "json",
    },
  },
  {
    commandPath: "delivery plan abandon",
    schema: DeliveryPlanAbandonInputSchema,
    schemaFields: { "option.json": "json" },
  },
  {
    commandPath: "delivery plan inventory schema",
    schema: DeliveryPlanInventorySchemaInputSchema,
    schemaFields: { "option.json": "json" },
  },
] as const satisfies readonly CommandInputRegistration[];

/** Machine-output policies owned by the delivery command family. */
export const deliveryCommandInputPolicyDeclarations = [
  {
    commandPath: "delivery plan from-tasks",
    aliases: [],
    sites: [
      declareCliOptionSite("design-inventory", {
        acquisition: "handler-required",
        schemaOwnership: "owned",
        schemaField: "designInventory",
        cancellation: "not-applicable",
        automation: {
          noInput: "require-explicit",
          flags: ["--design-inventory"],
          acceptedSyntax: ["--design-inventory <json-path>"],
        },
        mutationBoundary: "delivery authoring input validation",
        subprocess: "none",
      }),
      declareCliOptionSite("task-list", {
        acquisition: "safe-default",
        schemaOwnership: "owned",
        schemaField: "taskList",
        defaultSource: "active meta Task List pointer",
        cancellation: "not-applicable",
        automation: {
          noInput: "use-default",
          flags: ["--task-list"],
          acceptedSyntax: ["--task-list <path>"],
        },
        mutationBoundary: "delivery authoring locus validation",
        subprocess: "none",
      }),
      declareCliOptionSite("json", {
        acquisition: "machine-mode",
        schemaOwnership: "owned",
        schemaField: "json",
        cancellation: "not-applicable",
        automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
        mutationBoundary: "output selection",
        subprocess: "none",
      }),
    ],
  },
  {
    commandPath: "delivery plan from-branch",
    aliases: [],
    sites: [
      declareCliOptionSite("design-inventory", {
        acquisition: "handler-required",
        schemaOwnership: "owned",
        schemaField: "designInventory",
        cancellation: "not-applicable",
        automation: {
          noInput: "require-explicit",
          flags: ["--design-inventory"],
          acceptedSyntax: ["--design-inventory <json-path>"],
        },
        mutationBoundary: "delivery authoring input validation",
        subprocess: "none",
      }),
      declareCliOptionSite("base", {
        acquisition: "safe-default",
        schemaOwnership: "owned",
        schemaField: "base",
        defaultSource: "configured base branch",
        cancellation: "not-applicable",
        automation: {
          noInput: "use-default",
          flags: ["--base"],
          acceptedSyntax: ["--base <commit-ish>"],
        },
        mutationBoundary: "branch inspection",
        subprocess: "none",
      }),
      declareCliOptionSite("head", {
        acquisition: "safe-default",
        schemaOwnership: "owned",
        schemaField: "head",
        defaultSource: "HEAD",
        cancellation: "not-applicable",
        automation: {
          noInput: "use-default",
          flags: ["--head"],
          acceptedSyntax: ["--head <commit-ish>"],
        },
        mutationBoundary: "branch inspection",
        subprocess: "none",
      }),
      declareCliOptionSite("json", {
        acquisition: "machine-mode",
        schemaOwnership: "owned",
        schemaField: "json",
        cancellation: "not-applicable",
        automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
        mutationBoundary: "output selection",
        subprocess: "none",
      }),
    ],
  },
  {
    commandPath: "delivery compose",
    aliases: [],
    sites: [
      declareCliOptionSite("landed-prefix", {
        acquisition: "required-evidence",
        schemaOwnership: "owned",
        schemaField: "landedPrefix",
        cancellation: "stop",
        automation: {
          noInput: "require-explicit",
          flags: ["--landed-prefix <json>"],
          acceptedSyntax: ["--landed-prefix '<json-array>'"],
        },
        mutationBoundary: "bound delivery-plan amendment classification",
        subprocess: "none",
      }),
      declareCliOptionSite("json", {
        acquisition: "machine-mode",
        schemaOwnership: "owned",
        schemaField: "json",
        cancellation: "not-applicable",
        automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
        mutationBoundary: "output selection",
        subprocess: "none",
      }),
    ],
  },
  deliveryJsonPolicy("delivery plan abandon"),
  deliveryJsonPolicy("delivery plan inventory schema"),
] as const satisfies readonly CommandInputDeclaration[];

function deliveryJsonPolicy(commandPath: string): CommandInputDeclaration {
  return {
    commandPath,
    aliases: [],
    sites: [declareCliOptionSite("json", {
      acquisition: "machine-mode",
      schemaOwnership: "owned",
      schemaField: "json",
      cancellation: "not-applicable",
      automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection",
      subprocess: "none",
    })],
  };
}

type DeliveryCommandResult =
  | { readonly status: "ok"; readonly value: unknown }
  | { readonly status: "refused"; readonly reason: string }
  | {
    readonly status: "replacement-required";
    readonly affectedDeliverableIds: readonly CanonicalDigest[];
  };

/** Build and persist one task-list-derived starter map after all file input validates. */
export async function handleDeliveryPlanFromTasks(
  opts: DeliveryPlanFromTasksOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const parsed = DeliveryPlanFromTasksInputSchema.safeParse(opts);
  if (!parsed.success) {
    emit("delivery plan from-tasks", opts.json === true, {
      status: "refused",
      reason: "invalid-command-input",
    });
    return;
  }
  const context = await resolveDeliveryContext(interaction);
  if (context.status === "refused") {
    emit("delivery plan from-tasks", parsed.data.json === true, context);
    return;
  }
  const inputs = await readFromTasksInputs(
    context.cwd,
    context.activePath,
    context.workUnitId,
    parsed.data.designInventory,
    true,
    parsed.data.taskList,
  );
  if (inputs.status === "refused") {
    emit("delivery plan from-tasks", parsed.data.json === true, inputs);
    return;
  }
  const planIdentity = await resolveAuthoringPlanIdentity(context);
  if (planIdentity.status === "refused") {
    emit("delivery plan from-tasks", parsed.data.json === true, planIdentity);
    return;
  }
  const prepared = prepareDeliveryFromTasksAuthoring({
    mapId: `map-${randomUUID()}`,
    planId: planIdentity.planId,
    workUnitId: context.workUnitId,
    expectedCurrentPlanDigest: planIdentity.expectedCurrentPlanDigest,
    taskListPath: inputs.taskListPath,
    taskListContent: inputs.taskListContent,
    designInventory: inputs.designInventory,
  });
  if (prepared.status === "refused") {
    emit("delivery plan from-tasks", parsed.data.json === true, prepared);
    return;
  }
  const result = await new DeliveryAuthoringManager(
    context.authoringStore,
    context.transitionSource,
  ).create({
    pair: { snapshot: prepared.snapshot, markdown: prepared.markdown },
    currentWorkUnitId: context.workUnitId,
    authority: context.authority,
  });
  emit("delivery plan from-tasks", parsed.data.json === true, result.status === "refused"
    ? result
    : {
      status: "ok",
      value: {
        mapId: result.value.snapshot.mapId,
        taskListPath: inputs.taskListPath,
      },
    });
}

/** Build and persist one branch-derived starter map after all inputs validate. */
export async function handleDeliveryPlanFromBranch(
  opts: DeliveryPlanFromBranchOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const parsed = DeliveryPlanFromBranchInputSchema.safeParse(opts);
  if (!parsed.success) {
    emit("delivery plan from-branch", opts.json === true, {
      status: "refused",
      reason: "invalid-command-input",
    });
    return;
  }
  const context = await resolveDeliveryContext(interaction);
  if (context.status === "refused") {
    emit("delivery plan from-branch", parsed.data.json === true, context);
    return;
  }
  const base = parsed.data.base ?? context.baseBranch.trim();
  if (base === "") {
    emit("delivery plan from-branch", parsed.data.json === true, {
      status: "refused",
      reason: "base-branch-unresolved",
    });
    return;
  }
  const inputs = await readFromTasksInputs(
    context.cwd,
    context.activePath,
    context.workUnitId,
    parsed.data.designInventory,
    false,
  );
  if (inputs.status === "refused") {
    emit("delivery plan from-branch", parsed.data.json === true, inputs);
    return;
  }
  const planIdentity = await resolveAuthoringPlanIdentity(context);
  if (planIdentity.status === "refused") {
    emit("delivery plan from-branch", parsed.data.json === true, planIdentity);
    return;
  }
  const prepared = await prepareDeliveryFromBranchAuthoring({
    mapId: `map-${randomUUID()}`,
    planId: planIdentity.planId,
    workUnitId: context.workUnitId,
    expectedCurrentPlanDigest: planIdentity.expectedCurrentPlanDigest,
    taskListPath: inputs.taskListPath,
    taskListContent: inputs.taskListContent,
    designInventory: inputs.designInventory,
    exec: createRawGitExec(context.cwd),
    base,
    head: parsed.data.head ?? "HEAD",
  });
  if (prepared.status === "refused") {
    emit("delivery plan from-branch", parsed.data.json === true, prepared);
    return;
  }
  const result = await new DeliveryAuthoringManager(
    context.authoringStore,
    context.transitionSource,
  ).create({
    pair: { snapshot: prepared.snapshot, markdown: prepared.markdown },
    currentWorkUnitId: context.workUnitId,
    authority: context.authority,
  });
  emit("delivery plan from-branch", parsed.data.json === true, result.status === "refused"
    ? result
    : {
      status: "ok",
      value: {
        mapId: result.value.snapshot.mapId,
        taskListPath: inputs.taskListPath,
        base: prepared.inspection.base,
        head: prepared.inspection.head,
      },
    });
}

/** Resolve and integrity-check the singleton map before entry adapters project it. */
export async function handleDeliveryCompose(
  opts: DeliveryComposeOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const parsed = DeliveryComposeInputSchema.safeParse(opts);
  if (!parsed.success) {
    emit("delivery compose", opts.json === true, {
      status: "refused",
      reason: "invalid-command-input",
    });
    return;
  }
  const landedDeliverableIds = parseLandedPrefixOption(parsed.data.landedPrefix);
  if (landedDeliverableIds === "invalid") {
    emit("delivery compose", parsed.data.json === true, {
      status: "refused",
      reason: "invalid-command-input",
    });
    return;
  }
  const context = await resolveDeliveryContext(interaction);
  if (context.status === "refused") {
    emit("delivery compose", parsed.data.json === true, context);
    return;
  }
  const resolution = await resolveExistingDeliveryAuthoringMap({
    store: context.authoringStore,
    currentWorkUnitId: context.workUnitId,
    authority: context.authority,
    transitionSource: context.transitionSource,
  });
  if (resolution.status === "indeterminate") {
    emit("delivery compose", parsed.data.json === true, {
      status: "refused",
      reason: resolution.reason,
    });
    return;
  }
  if (resolution.status === "no-match") {
    emit("delivery compose", parsed.data.json === true, {
      status: "refused",
      reason: "authoring-map-missing",
    });
    return;
  }
  const sourceInputs = resolution.record.snapshot.source.entry === "from-tasks"
    ? FromTasksSourceInputsSchema.safeParse(resolution.record.snapshot.source.inputs)
    : FromBranchSourceInputsSchema.safeParse(resolution.record.snapshot.source.inputs);
  if (!sourceInputs.success) {
    emit("delivery compose", parsed.data.json === true, {
      status: "refused",
      reason: "authoring-state-corrupt",
    });
    return;
  }
  const taskListPath = resolveRepositoryPath(context.cwd, sourceInputs.data.taskListPath);
  if (taskListPath === null) {
    emit("delivery compose", parsed.data.json === true, {
      status: "refused",
      reason: "task-list-path-invalid",
    });
    return;
  }
  const composer = new DeliveryPlanComposer({
    authoringStore: context.authoringStore,
    planStore: context.planStore,
    stateStore: context.stateStore,
    renderer: new RepositoryDeliveryTaskListRenderer(context.cwd, taskListPath),
    transitionSource: context.transitionSource,
  });
  if (resolution.record.markdown === null) {
    const sourceAdvisories = resolution.record.snapshot.source.entry === "from-branch"
      ? resolveDeliveryFromBranchSourceAdvisories(resolution.record.snapshot)
      : { status: "resolved" as const, advisories: [] };
    if (sourceAdvisories.status === "refused") {
      emit("delivery compose", parsed.data.json === true, sourceAdvisories);
      return;
    }
    const recovery = await composer.recover({
      record: resolution.record,
      currentWorkUnitId: context.workUnitId,
      authority: context.authority,
      sourceAdvisories: sourceAdvisories.advisories,
    });
    emit("delivery compose", parsed.data.json === true, recovery.status !== "composed"
      ? recovery
      : {
        status: "ok",
        value: {
          planDigest: recovery.plan.planDigest,
          recoveredCleanup: true,
          advisories: recovery.advisories,
        },
      });
    return;
  }
  const integrity = validateDeliveryAuthoringMap(
    resolution.record.markdown,
    resolution.record.snapshot,
  );
  if (integrity.status === "refused") {
    emit("delivery compose", parsed.data.json === true, integrity);
    return;
  }
  const projection = resolution.record.snapshot.source.entry === "from-tasks"
    ? resolveDeliveryFromTasksProjection({
      snapshot: resolution.record.snapshot,
      slots: integrity.slots,
    })
    : resolveDeliveryFromBranchProjection({
      snapshot: resolution.record.snapshot,
      slots: integrity.slots,
    });
  if (projection.status === "refused") {
    emit("delivery compose", parsed.data.json === true, projection);
    return;
  }
  let taskListContent: string;
  try {
    taskListContent = await readFile(resolve(context.cwd, taskListPath), "utf8");
  } catch {
    emit("delivery compose", parsed.data.json === true, {
      status: "refused",
      reason: "task-list-unreadable",
    });
    return;
  }
  const currentTaskInventory = buildDeliveryTaskInventory(taskListContent);
  if (currentTaskInventory.status === "refused") {
    emit("delivery compose", parsed.data.json === true, currentTaskInventory);
    return;
  }
  const authoredTaskInventory = taskInventoryFromSnapshot(resolution.record.snapshot.tasks);
  if (canonicalize(currentTaskInventory.inventory) !== canonicalize(authoredTaskInventory)) {
    emit("delivery compose", parsed.data.json === true, {
      status: "refused",
      reason: "task-inventory-drift",
    });
    return;
  }
  if (resolution.record.snapshot.source.entry === "from-tasks"
    && integrity.slots.boundary.kind === "phase-aligned") {
    const currentPhaseFacts = revalidateDeliveryFromTasksPhaseFacts({
      snapshot: resolution.record.snapshot,
      taskListContent,
      taskInventory: currentTaskInventory.inventory,
    });
    if (currentPhaseFacts.status === "refused") {
      emit("delivery compose", parsed.data.json === true, currentPhaseFacts);
      return;
    }
  }
  const composition = await composer.compose({
    record: resolution.record,
    currentWorkUnitId: context.workUnitId,
    authority: context.authority,
    projection: projection.projection,
    taskInventory: currentTaskInventory.inventory,
    designInventory: designInventoryFromSnapshot(resolution.record.snapshot.design),
    landedDeliverableIds,
  });
  emit("delivery compose", parsed.data.json === true, composition.status !== "composed"
    ? composition
    : {
      status: "ok",
      value: {
        planDigest: composition.plan.planDigest,
        advisories: composition.advisories,
      },
    });
}

/** Abandon the rename-resolved singleton map and tolerate already-absent or torn state. */
export async function handleDeliveryPlanAbandon(
  opts: DeliveryPlanAbandonOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const parsed = DeliveryPlanAbandonInputSchema.safeParse(opts);
  if (!parsed.success) {
    emit("delivery plan abandon", opts.json === true, {
      status: "refused",
      reason: "invalid-command-input",
    });
    return;
  }
  const context = await resolveDeliveryContext(interaction);
  if (context.status === "refused") {
    emit("delivery plan abandon", parsed.data.json === true, context);
    return;
  }
  const result = await new DeliveryAuthoringManager(
    context.authoringStore,
    context.transitionSource,
  ).abandon({
    currentWorkUnitId: context.workUnitId,
    authority: context.authority,
  });
  emit("delivery plan abandon", parsed.data.json === true, result);
}

/** Emit the registered design-inventory authoring schema through the delivery envelope. */
export function handleDeliveryPlanInventorySchema(opts: DeliveryPlanInventorySchemaOptions): void {
  const parsed = DeliveryPlanInventorySchemaInputSchema.safeParse(opts);
  if (!parsed.success) {
    emit("delivery plan inventory schema", opts.json === true, {
      status: "refused",
      reason: "invalid-command-input",
    });
    return;
  }
  const registry = registerDeliveryAuthoringSchemas(registerDeliveryDomainSchemas(createKernelRegistry()));
  const schema = projectKernelSchemas(registry).schemas[DELIVERY_DESIGN_INVENTORY_INPUT_SCHEMA_ID];
  if (schema === undefined) {
    emit("delivery plan inventory schema", parsed.data.json === true, {
      status: "refused",
      reason: "schema-unavailable",
    });
    return;
  }
  emit("delivery plan inventory schema", parsed.data.json === true, {
    status: "ok",
    value: {
      id: DELIVERY_DESIGN_INVENTORY_INPUT_SCHEMA_ID,
      version: DELIVERY_DESIGN_INVENTORY_INPUT_SCHEMA_VERSION,
      schema,
    },
  });
}

async function resolveDeliveryContext(interaction?: InteractionContext) {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return { status: "refused", reason: "arc-project-root-unresolved" } as const;
  const active = await resolveActiveWu({ cwd });
  if (active.status !== "resolved" || active.name === "") {
    return { status: "refused", reason: "active-work-unit-unresolved" } as const;
  }
  const exec = createGitExec(interaction?.subprocess);
  const transitionExec = createRawGitExec(cwd);
  const publisher = new RepositoryGitCommonStatePublisher(exec, cwd);
  const { settings } = await readConfigSettings(cwd);
  const base = settings["branch.base"];
  const authority = base.trim() === ""
    ? { status: "unestablished" as const }
    : { status: "established" as const, ref: `refs/heads/${base}` };
  return {
    status: "ok" as const,
    cwd,
    activePath: active.path,
    workUnitId: active.name,
    baseBranch: base,
    authority,
    authoringStore: new RepositoryDeliveryAuthoringStore(publisher),
    planStore: new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec),
    stateStore: new RepositoryDeliveryStateStore(publisher),
    transitionSource: new GitDeliveryRenameTransitionSource(transitionExec),
  };
}

function parseLandedPrefixOption(value: string | undefined): readonly CanonicalDigest[] | null | "invalid" {
  if (value === undefined) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return "invalid";
  }
  const parsed = z.array(DeliveryCanonicalDigestSchema).safeParse(decoded);
  return parsed.success ? parsed.data.map((deliverableId) => {
    assertCanonicalDigest(deliverableId);
    return deliverableId;
  }) : "invalid";
}

async function resolveAuthoringPlanIdentity(
  context: Extract<Awaited<ReturnType<typeof resolveDeliveryContext>>, { readonly status: "ok" }>,
): Promise<{
  readonly status: "ok";
  readonly planId: string;
  readonly expectedCurrentPlanDigest: string | null;
} | { readonly status: "refused"; readonly reason: string }> {
  const current = await resolveExistingDeliveryPlan<DeliveryPlanV1>({
    planStore: context.planStore,
    currentWorkUnitId: context.workUnitId,
    planWorkUnitId: (plan) => plan.workUnitId,
    authority: context.authority,
    transitionSource: context.transitionSource,
  });
  if (current.status === "indeterminate") {
    return { status: "refused", reason: current.reason };
  }
  return current.status === "match"
    ? {
      status: "ok",
      planId: current.plan.planId,
      expectedCurrentPlanDigest: current.plan.planDigest,
    }
    : {
      status: "ok",
      planId: randomUUID(),
      expectedCurrentPlanDigest: null,
    };
}

async function readFromTasksInputs(
  cwd: string,
  activeMetaPath: string,
  workUnitId: string,
  designInventoryPath: string,
  requireDesignCoherence: boolean,
  explicitTaskListPath?: string,
): Promise<{
  readonly status: "ok";
  readonly taskListPath: string;
  readonly taskListContent: string;
  readonly designInventory: unknown;
} | { readonly status: "refused"; readonly reason: string }> {
  let meta: ReturnType<typeof parseMetaFile>;
  let metaRecord: ReturnType<typeof parseMetaRecord>;
  try {
    const metaContent = await readFile(resolve(cwd, activeMetaPath), "utf8");
    meta = parseMetaFile(metaContent);
    metaRecord = parseMetaRecord(metaContent);
  } catch {
    return { status: "refused", reason: "active-work-unit-unreadable" };
  }
  if (explicitTaskListPath === undefined && (meta.taskList === null || meta.taskList === "[none]")) {
    return { status: "refused", reason: "task-list-path-unresolved" };
  }
  const candidate = explicitTaskListPath
    ?? `${dirname(activeMetaPath)}/${String(meta.taskList)}`;
  const taskListPath = resolveRepositoryPath(cwd, candidate);
  if (taskListPath === null) {
    return { status: "refused", reason: "task-list-path-invalid" };
  }
  if (explicitTaskListPath !== undefined) {
    const expected = `${dirname(activeMetaPath).replaceAll("\\", "/")}/tasks-${workUnitId}.md`;
    if (taskListPath !== expected) {
      return { status: "refused", reason: "task-list-path-invalid" };
    }
    try {
      const realRoot = await realpath(cwd);
      const realTaskList = await realpath(resolve(cwd, taskListPath));
      const realRelation = relative(realRoot, realTaskList);
      if (realRelation === ""
        || realRelation === ".."
        || realRelation.startsWith("../")
        || realRelation.startsWith("..\\")
        || isAbsolute(realRelation)) {
        return { status: "refused", reason: "task-list-path-invalid" };
      }
    } catch {
      // Preserve the established task-list-unreadable refusal below for missing or inaccessible files.
    }
  }
  let taskListContent: string;
  let designInventory: unknown;
  try {
    taskListContent = await readFile(resolve(cwd, taskListPath), "utf8");
  } catch {
    return { status: "refused", reason: "task-list-unreadable" };
  }
  if (requireDesignCoherence) {
    const taskDesign = /^- \*\*Design:\*\*\s+`([^`]+)`\s*$/mu.exec(taskListContent)?.[1];
    if (taskDesign === undefined
      || metaRecord.design.length === 0
      || metaRecord.design.length > 2
      || !metaRecord.design.includes(taskDesign)) {
      return { status: "refused", reason: "task-list-design-incoherent" };
    }
  }
  try {
    designInventory = JSON.parse(await readFile(resolve(cwd, designInventoryPath), "utf8")) as unknown;
  } catch {
    return { status: "refused", reason: "invalid-design-inventory" };
  }
  return { status: "ok", taskListPath, taskListContent, designInventory };
}

function resolveRepositoryPath(cwd: string, candidate: string): string | null {
  if (isAbsolute(candidate)) return null;
  const absolute = resolve(cwd, candidate);
  const relation = relative(cwd, absolute).replaceAll("\\", "/");
  return relation === "" || relation === ".." || relation.startsWith("../") || isAbsolute(relation)
    ? null
    : relation;
}

function taskInventoryFromSnapshot(
  tasks: z.infer<typeof import("../lib/delivery/authoring-schema.js").DeliveryAuthoringTaskInventorySchema>,
): DeliveryTaskInventory {
  const inventoryDigest = tasks.inventoryDigest;
  assertCanonicalDigest(inventoryDigest);
  return {
    inventoryDigest,
    implementation: tasks.implementation.map((task) => {
      const semanticDigest = task.semanticDigest;
      assertCanonicalDigest(semanticDigest);
      return { taskId: task.taskId, semanticDigest };
    }),
    verificationTaskId: tasks.verificationTaskId,
  };
}

function designInventoryFromSnapshot(
  design: z.infer<typeof import("../lib/delivery/authoring-schema.js").DeliveryAuthoringDesignInventorySchema>,
): BoundDesignInventory {
  return {
    artifacts: design.artifacts.map((artifact) => {
      const revisionDigest = artifact.revisionDigest;
      assertCanonicalDigest(revisionDigest);
      return { artifactId: artifact.artifactId, revisionDigest };
    }),
    elements: design.elements.map((element) => {
      const semanticDigest = element.semanticDigest;
      assertCanonicalDigest(semanticDigest);
      return { elementId: element.elementId, semanticDigest };
    }),
  };
}

function emit(command: string, json: boolean, result: DeliveryCommandResult): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command, ...result })}\n`);
  } else if (result.status === "ok") {
    process.stdout.write(`${command}: ok\n`);
  } else if (result.status === "replacement-required") {
    process.stderr.write(
      `${command} requires replacement: ${result.affectedDeliverableIds.join(", ")}\n`,
    );
  } else {
    process.stderr.write(`${command} refused: ${result.reason}\n`);
  }
  if (result.status !== "ok") process.exitCode = 1;
}
