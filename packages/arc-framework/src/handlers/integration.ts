/** CLI adapter for typed integration procedures. */

import { z } from "zod";

import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { createGitExec } from "../lib/io-context.js";
import {
  checkpointIntegration,
  checkpointInputRefusal,
  checkpointOperationRefusal,
  IntegrationCheckpointRequestSchema,
  IntegrationCheckpointResultSchema,
  type IntegrationCheckpointResult,
} from "../scripts/integration/checkpoint.js";
import { createIntegrationCheckpointDependencies } from "../scripts/integration/checkpoint-composition.js";
import { createIntegrationMergeDependencies } from "../scripts/integration/merge-composition.js";
import {
  IntegrationMergeResultSchema,
  mergeIntegration,
  mergeInputRefusal,
  mergeOperationRefusal,
  type IntegrationMergeResult,
} from "../scripts/integration/merge.js";
import { requireArcProjectRoot } from "./shared.js";

export const IntegrationCheckpointCommandInputSchema = z.strictObject({
  name: IntegrationCheckpointRequestSchema.shape.workUnit,
});

export const IntegrationMergeCommandInputSchema = z.strictObject({
  name: IntegrationCheckpointRequestSchema.shape.workUnit,
  checkpoint: z.string().regex(
    /^checkpoint-v1:(?:[0-9a-f]{40}|[0-9a-f]{64}):sha256:[0-9a-f]{64}$/u,
  ),
});

const integrationCheckpointInputRegistration = {
  commandPath: "integrate checkpoint",
  schema: IntegrationCheckpointCommandInputSchema,
  schemaFields: { "operand.name": "name" },
} satisfies CommandInputRegistration;

const integrationMergeInputRegistration = {
  commandPath: "integrate merge",
  schema: IntegrationMergeCommandInputSchema,
  schemaFields: { "operand.name": "name", "option.checkpoint": "checkpoint" },
} satisfies CommandInputRegistration;

const integrationCheckpointJsonPolicy = declareCliOptionSite("json", {
  acquisition: "machine-mode",
  schemaOwnership: "none",
  cancellation: "not-applicable",
  automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
  mutationBoundary: "output selection",
  subprocess: "none",
});

const integrationMergeJsonPolicy = declareCliOptionSite("json", {
  acquisition: "machine-mode",
  schemaOwnership: "none",
  cancellation: "not-applicable",
  automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
  mutationBoundary: "output selection",
  subprocess: "none",
});

/** Command-input schema registrations owned by integration procedures. */
export const integrationCommandInputRegistrations = [
  integrationCheckpointInputRegistration,
  integrationMergeInputRegistration,
] as const satisfies readonly CommandInputRegistration[];

/** Command-input policy declarations owned by integration procedures. */
export const integrationCommandInputPolicyDeclarations = [{
  commandPath: "integrate checkpoint",
  aliases: [],
  sites: [integrationCheckpointJsonPolicy],
}, {
  commandPath: "integrate merge",
  aliases: [],
  sites: [integrationMergeJsonPolicy],
}] as const satisfies readonly CommandInputDeclaration[];

export interface IntegrationCheckpointOptions {
  json?: boolean;
}

export interface IntegrationMergeOptions {
  checkpoint: string;
  json?: boolean;
}

export interface IntegrationCheckpointHandlerDependencies {
  checkpoint(cwd: string, workUnit: string): Promise<IntegrationCheckpointResult>;
  write(text: string): void;
  setExitCode(code: number): void;
}

export interface IntegrationMergeHandlerDependencies {
  merge(cwd: string, workUnit: string, checkpoint: string): Promise<IntegrationMergeResult>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function stableOperationFailureDetail(error: unknown): string {
  const detail = (error instanceof Error ? error.message : String(error)).trim();
  return detail === "" ? "The integration operation failed without diagnostic detail." : detail;
}

/** Run the integration checkpoint for one exact work-unit name. */
export async function handleIntegrationCheckpoint(
  name: string,
  _options: IntegrationCheckpointOptions,
  interaction?: InteractionContext,
  overrides: Partial<IntegrationCheckpointHandlerDependencies> = {},
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const exec = createGitExec(interaction?.subprocess);
  const dependencies: IntegrationCheckpointHandlerDependencies = {
    checkpoint: (root, workUnit) => checkpointIntegration(
      { schemaVersion: 1, workUnit },
      createIntegrationCheckpointDependencies({ cwd: root, exec }),
    ),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
    ...overrides,
  };
  const parsed = IntegrationCheckpointCommandInputSchema.safeParse({ name });
  if (!parsed.success) {
    dependencies.write(`${JSON.stringify(checkpointInputRefusal(
      parsed.error.issues.map(({ message }) => message).join("; "),
    ))}\n`);
    dependencies.setExitCode(64);
    return;
  }
  try {
    const result = IntegrationCheckpointResultSchema.parse(
      await dependencies.checkpoint(cwd, parsed.data.name),
    );
    dependencies.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    dependencies.write(`${JSON.stringify(checkpointOperationRefusal(
      parsed.data.name,
      stableOperationFailureDetail(error),
    ))}\n`);
    dependencies.setExitCode(1);
  }
}

/** Run the exact-checkpoint post-approval integration merge. */
export async function handleIntegrationMerge(
  name: string,
  options: IntegrationMergeOptions,
  interaction?: InteractionContext,
  overrides: Partial<IntegrationMergeHandlerDependencies> = {},
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const exec = createGitExec(interaction?.subprocess);
  const dependencies: IntegrationMergeHandlerDependencies = {
    merge: (root, workUnit, checkpoint) => mergeIntegration(
      { schemaVersion: 1, workUnit, checkpointHandle: checkpoint },
      createIntegrationMergeDependencies({ cwd: root, exec, workUnit }),
    ),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
    ...overrides,
  };
  const parsed = IntegrationMergeCommandInputSchema.safeParse({ name, checkpoint: options.checkpoint });
  if (!parsed.success) {
    dependencies.write(`${JSON.stringify(mergeInputRefusal(
      parsed.error.issues.map(({ message }) => message).join("; "),
    ))}\n`);
    dependencies.setExitCode(64);
    return;
  }
  try {
    const result = IntegrationMergeResultSchema.parse(await dependencies.merge(
      cwd,
      parsed.data.name,
      parsed.data.checkpoint,
    ));
    dependencies.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    dependencies.write(`${JSON.stringify(mergeOperationRefusal(
      parsed.data.name,
      stableOperationFailureDetail(error),
    ))}\n`);
    dependencies.setExitCode(1);
  }
}
