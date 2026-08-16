/** Create-only persistence for exact integration checkpoint compositions. */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { canonicalDigest, canonicalize } from "../../lib/canonical/canonical-json.js";
import { atomicCreateFile } from "../../lib/fs.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { ValidatedMergeMethodSchema } from "./checkpoint.js";
import { CanonicalSettlementPlanSchema } from "./settlement-plan.js";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
export const IntegrationCheckpointHandleSchema = z.string().regex(
  /^checkpoint-v1:(?:[0-9a-f]{40}|[0-9a-f]{64}):sha256:[0-9a-f]{64}$/u,
);

export const IntegrationCheckpointCompositionRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("integration-checkpoint-composition/v1"),
  checkpointId: z.uuid(),
  workUnit: SlugSchema,
  approvedHead: ObjectIdSchema,
  settlementPlan: CanonicalSettlementPlanSchema,
  mergeMethod: ValidatedMergeMethodSchema,
  compositionDigest: DigestSchema,
});
export type IntegrationCheckpointCompositionRecord = z.infer<
  typeof IntegrationCheckpointCompositionRecordSchema
>;

export interface IntegrationCheckpointCompositionInput {
  workUnit: string;
  approvedHead: string;
  settlementPlan: z.infer<typeof CanonicalSettlementPlanSchema>;
  mergeMethod: z.infer<typeof ValidatedMergeMethodSchema>;
}

export interface IntegrationCheckpointStoreFs {
  readFile(path: string): Promise<string>;
  createFile(path: string, content: string): Promise<void>;
}

export interface IntegrationCheckpointStoreDependencies {
  fs: IntegrationCheckpointStoreFs;
  randomId(): string;
}

const nodeStoreDependencies: IntegrationCheckpointStoreDependencies = {
  fs: {
    readFile: (path) => readFile(path, "utf8"),
    createFile: atomicCreateFile,
  },
  randomId: randomUUID,
};

function digestComposition(input: {
  checkpointId: string;
  settlementPlan: z.infer<typeof CanonicalSettlementPlanSchema>;
  mergeMethod: z.infer<typeof ValidatedMergeMethodSchema>;
}): string {
  return canonicalDigest({
    domain: "arc.integration-checkpoint-composition/v1",
    checkpointId: input.checkpointId,
    settlementPlan: input.settlementPlan,
    mergeMethod: input.mergeMethod,
  });
}

function parseHandle(handle: string): { approvedHead: string; digest: string } {
  const parsed = IntegrationCheckpointHandleSchema.parse(handle);
  const match = /^checkpoint-v1:([0-9a-f]{40}|[0-9a-f]{64}):(sha256:[0-9a-f]{64})$/u.exec(parsed);
  if (match?.[1] === undefined || match[2] === undefined) throw new Error("Malformed integration checkpoint handle.");
  return { approvedHead: match[1], digest: match[2] };
}

function recordPath(workUnitRoot: string, handle: string): string {
  const { digest } = parseHandle(handle);
  return join(workUnitRoot, ".internal", "integration-checkpoints", `${digest.slice("sha256:".length)}.json`);
}

/** Persist one immutable checkpoint composition and return its opaque approval handle. */
export async function persistIntegrationCheckpointComposition(
  workUnitRoot: string,
  input: IntegrationCheckpointCompositionInput,
  overrides: Partial<IntegrationCheckpointStoreDependencies> = {},
): Promise<string> {
  const dependencies = { ...nodeStoreDependencies, ...overrides };
  const checkpointId = dependencies.randomId();
  const compositionDigest = digestComposition({ checkpointId, ...input });
  const record = IntegrationCheckpointCompositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "integration-checkpoint-composition/v1",
    checkpointId,
    ...input,
    compositionDigest,
  });
  const handle = IntegrationCheckpointHandleSchema.parse(
    `checkpoint-v1:${record.approvedHead}:${record.compositionDigest}`,
  );
  await dependencies.fs.createFile(recordPath(workUnitRoot, handle), canonicalize(record));
  return handle;
}

/** Read one handle-keyed composition from a work unit's gitignored workspace. */
export async function readIntegrationCheckpointComposition(
  workUnitRoot: string,
  workUnit: string,
  handle: string,
  fs: IntegrationCheckpointStoreFs = nodeStoreDependencies.fs,
): Promise<IntegrationCheckpointCompositionRecord | null> {
  let content: string;
  try {
    content = await fs.readFile(recordPath(workUnitRoot, handle));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error("The persisted integration checkpoint is malformed.", { cause: error });
  }
  const record = IntegrationCheckpointCompositionRecordSchema.parse(value);
  const parsedHandle = parseHandle(handle);
  const expectedDigest = digestComposition(record);
  if (
    record.workUnit !== SlugSchema.parse(workUnit)
    || record.approvedHead !== parsedHandle.approvedHead
    || record.compositionDigest !== parsedHandle.digest
    || record.compositionDigest !== expectedDigest
  ) {
    throw new Error("The persisted integration checkpoint does not match its handle.");
  }
  return record;
}
