/** CLI adapters for exact delivery plan/state transfer between repository clones. */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { readConfigSettings } from "../lib/config/status-reader.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../lib/delivery/plan.js";
import {
  GitDeliveryRenameTransitionSource,
  resolveExistingDeliveryPlan,
  resolveForwardDeliverySubject,
} from "../lib/delivery/plan-resolution.js";
import type { DeliveryPlanV1 } from "../lib/delivery/schema.js";
import {
  DeliveryTransferBundleV1Schema,
  buildDeliveryTransferBundle,
  classifyDeliveryTransferImport,
} from "../lib/delivery/transfer.js";
import { RepositoryGitCommonStatePublisher } from "../lib/git-common-state.js";
import { createGitExec, createRawGitExec } from "../lib/io-context.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import { requireArcProjectRoot } from "./shared.js";

const DeliveryTransferExportInputSchema = z.strictObject({
  output: z.string().trim().min(1),
  json: z.boolean().optional(),
});
const DeliveryTransferImportInputSchema = z.strictObject({
  input: z.string().trim().min(1),
  json: z.boolean().optional(),
});

export interface DeliveryTransferExportOptions {
  readonly output?: string;
  readonly json?: boolean;
}

export interface DeliveryTransferImportOptions {
  readonly input?: string;
  readonly json?: boolean;
}

/** Command-owned schemas for the exact delivery transfer family. */
export const deliveryTransferCommandInputRegistrations = [
  {
    commandPath: "delivery transfer export",
    schema: DeliveryTransferExportInputSchema,
    schemaFields: { "option.output": "output", "option.json": "json" },
  },
  {
    commandPath: "delivery transfer import",
    schema: DeliveryTransferImportInputSchema,
    schemaFields: { "option.input": "input", "option.json": "json" },
  },
] as const satisfies readonly CommandInputRegistration[];

/** Machine-output and acquisition policies for exact delivery transfer. */
export const deliveryTransferCommandInputPolicyDeclarations = [
  transferPolicy("delivery transfer export", "output", "transfer bundle publication"),
  transferPolicy("delivery transfer import", "input", "delivery state import"),
] as const satisfies readonly CommandInputDeclaration[];

type DeliveryTransferCommandResult =
  | { readonly status: "ok"; readonly value: unknown }
  | { readonly status: "refused"; readonly reason: string };

/** Export the active work unit's exact delivery plan/state pair. */
export async function handleDeliveryTransferExport(
  opts: DeliveryTransferExportOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const parsed = DeliveryTransferExportInputSchema.safeParse(opts);
  if (!parsed.success) {
    emit("delivery transfer export", opts.json === true, {
      status: "refused",
      reason: "invalid-command-input",
    });
    return;
  }
  const context = await resolveDeliveryTransferContext(interaction);
  if (context.status === "refused") {
    emit("delivery transfer export", parsed.data.json === true, context);
    return;
  }
  const current = await resolveExistingDeliveryPlan<DeliveryPlanV1>({
    planStore: context.planStore,
    currentWorkUnitId: context.workUnitId,
    planWorkUnitId: (plan) => plan.workUnitId,
    authority: context.authority,
    transitionSource: context.transitionSource,
  });
  if (current.status !== "match") {
    emit("delivery transfer export", parsed.data.json === true, {
      status: "refused",
      reason: current.status === "no-match" ? "canonical-plan-missing" : current.reason,
    });
    return;
  }
  const state = await context.stateStore.read(current.plan.planId);
  if (state.status === "refused" || state.value === null) {
    emit("delivery transfer export", parsed.data.json === true, state.status === "refused"
      ? state
      : { status: "refused", reason: "canonical-state-missing" });
    return;
  }
  const transfer = buildDeliveryTransferBundle({ plan: current.plan, state: state.value });
  if (transfer.status === "refused") {
    emit("delivery transfer export", parsed.data.json === true, transfer);
    return;
  }
  const outputPath = resolve(context.cwd, parsed.data.output);
  try {
    await writeFile(outputPath, `${JSON.stringify(transfer.bundle)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    emit("delivery transfer export", parsed.data.json === true, {
      status: "refused",
      reason: (error as NodeJS.ErrnoException).code === "EEXIST"
        ? "output-already-exists"
        : "output-unwritable",
    });
    return;
  }
  emit("delivery transfer export", parsed.data.json === true, {
    status: "ok",
    value: {
      outputPath,
      planId: current.plan.planId,
      workUnitId: current.plan.workUnitId,
      stateRevision: state.value.revision,
    },
  });
}

/** Import an exact delivery plan/state pair for the active work unit. */
export async function handleDeliveryTransferImport(
  opts: DeliveryTransferImportOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const parsed = DeliveryTransferImportInputSchema.safeParse(opts);
  if (!parsed.success) {
    emit("delivery transfer import", opts.json === true, {
      status: "refused",
      reason: "invalid-command-input",
    });
    return;
  }
  const context = await resolveDeliveryTransferContext(interaction);
  if (context.status === "refused") {
    emit("delivery transfer import", parsed.data.json === true, context);
    return;
  }
  const inputPath = resolve(context.cwd, parsed.data.input);
  let decoded: unknown;
  try {
    decoded = JSON.parse(await readFile(inputPath, "utf8"));
  } catch (error) {
    emit("delivery transfer import", parsed.data.json === true, {
      status: "refused",
      reason: (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "input-unreadable"
        : "bundle-malformed",
    });
    return;
  }
  const bundle = DeliveryTransferBundleV1Schema.safeParse(decoded);
  if (!bundle.success) {
    emit("delivery transfer import", parsed.data.json === true, {
      status: "refused",
      reason: "bundle-malformed",
    });
    return;
  }
  const bundleSubject = await resolveForwardDeliverySubject({
    records: [bundle.data.plan],
    currentWorkUnitId: context.workUnitId,
    recordWorkUnitId: (plan) => plan.workUnitId,
    authority: context.authority,
    transitionSource: context.transitionSource,
  });
  if (bundleSubject.status === "indeterminate") {
    emit("delivery transfer import", parsed.data.json === true, {
      status: "refused",
      reason: bundleSubject.reason,
    });
    return;
  }
  const currentSubjectPlan = await resolveExistingDeliveryPlan<DeliveryPlanV1>({
    planStore: context.planStore,
    currentWorkUnitId: context.workUnitId,
    planWorkUnitId: (plan) => plan.workUnitId,
    authority: context.authority,
    transitionSource: context.transitionSource,
  });
  if (currentSubjectPlan.status === "indeterminate") {
    emit("delivery transfer import", parsed.data.json === true, {
      status: "refused",
      reason: currentSubjectPlan.reason,
    });
    return;
  }
  if (currentSubjectPlan.status === "match"
    && currentSubjectPlan.plan.planId !== bundle.data.plan.planId) {
    emit("delivery transfer import", parsed.data.json === true, {
      status: "refused",
      reason: "destination-conflict",
    });
    return;
  }
  const currentPlan = await context.planStore.readCurrent(bundle.data.plan.planId);
  const currentState = await context.stateStore.read(bundle.data.plan.planId);
  if (currentPlan.status === "refused" || currentState.status === "refused") {
    emit("delivery transfer import", parsed.data.json === true,
      currentPlan.status === "refused" ? currentPlan : currentState);
    return;
  }
  const admission = classifyDeliveryTransferImport({
    bundle: bundle.data,
    subjectMatches: bundleSubject.status === "match",
    currentPlan: currentPlan.value,
    currentState: currentState.value,
  });
  if (admission.status === "refused") {
    emit("delivery transfer import", parsed.data.json === true, admission);
    return;
  }
  // Plan-first keeps state-member lookup free of transferred records until the plan is safely restorable.
  // An interruption before state restoration leaves an idempotently retryable incomplete plan.
  if (admission.writePlan) {
    const restored = await context.planStore.restoreExact(bundle.data.plan.planId, bundle.data.plan);
    if (restored.status === "refused") {
      emit("delivery transfer import", parsed.data.json === true, restored);
      return;
    }
  }
  if (admission.writeState) {
    const restored = await context.stateStore.restoreExact(bundle.data.plan.planId, bundle.data.state);
    if (restored.status === "refused") {
      emit("delivery transfer import", parsed.data.json === true, restored);
      return;
    }
  }
  const disposition = admission.status === "already-current" ? "already-current" : "imported";
  emit("delivery transfer import", parsed.data.json === true, {
    status: "ok",
    value: {
      disposition,
      inputPath,
      planId: bundle.data.plan.planId,
      workUnitId: bundle.data.plan.workUnitId,
      stateRevision: bundle.data.state.revision,
    },
  });
}

async function resolveDeliveryTransferContext(interaction?: InteractionContext) {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return { status: "refused", reason: "arc-project-root-unresolved" } as const;
  const active = await resolveActiveWu({ cwd });
  if (active.status !== "resolved" || active.name === "") {
    return { status: "refused", reason: "active-work-unit-unresolved" } as const;
  }
  const publisher = new RepositoryGitCommonStatePublisher(
    createGitExec(interaction?.subprocess),
    cwd,
  );
  const { settings } = await readConfigSettings(cwd);
  const base = settings["branch.base"];
  const authority = base.trim() === ""
    ? { status: "unestablished" as const }
    : { status: "established" as const, ref: `refs/heads/${base}` };
  return {
    status: "ok" as const,
    cwd,
    workUnitId: active.name,
    authority,
    planStore: new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec),
    stateStore: new RepositoryDeliveryStateStore(publisher),
    transitionSource: new GitDeliveryRenameTransitionSource(createRawGitExec(cwd)),
  };
}

function transferPolicy(
  commandPath: string,
  option: "input" | "output",
  mutationBoundary: string,
): CommandInputDeclaration {
  return {
    commandPath,
    aliases: [],
    sites: [
      declareCliOptionSite(option, {
        acquisition: "handler-required",
        schemaOwnership: "owned",
        schemaField: option,
        cancellation: "not-applicable",
        automation: {
          noInput: "require-explicit",
          flags: [`--${option}`],
          acceptedSyntax: [`--${option} <path>`],
        },
        mutationBoundary,
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
  };
}

function emit(command: string, json: boolean, result: DeliveryTransferCommandResult): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command, ...result })}\n`);
  } else if (result.status === "ok") {
    process.stdout.write(`${command}: ok\n`);
  } else {
    process.stderr.write(`${command} refused: ${result.reason}\n`);
  }
  if (result.status !== "ok") process.exitCode = 1;
}
