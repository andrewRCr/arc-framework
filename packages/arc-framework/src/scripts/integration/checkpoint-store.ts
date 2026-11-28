/** Create-only persistence for exact integration checkpoint compositions. */

import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { canonicalDigest, canonicalize } from "../../lib/kernel/canonical/canonical-json.js";
import { atomicCreateFile } from "../../lib/fs.js";
import type { GitExec } from "../../lib/git/exec.js";
import { SlugSchema, type Slug } from "../../lib/kernel/schema/slug.js";
import { CanonicalDigestSchema } from "../../lib/kernel/schema/vocabulary.js";
import type { Store } from "../../lib/store/contract.js";
import { StoredUidSchema } from "../../lib/store/identity.js";
import { createUserSurfaceResolver, resolveUserSurfaceResolver } from "../../lib/user-surfaces.js";
import { ValidatedMergeMethodSchema } from "./checkpoint.js";
import { CanonicalSettlementPlanSchema } from "./settlement-plan.js";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const DigestSchema = CanonicalDigestSchema;
export const IntegrationCheckpointHandleSchema = z.string().regex(
  /^checkpoint-v1:(?:[0-9a-f]{40}|[0-9a-f]{64}):sha256:[0-9a-f]{64}$/u,
);

export const IntegrationCheckpointTargetSchema = z.strictObject({
  repository: z.string().min(1),
  pullRequest: z.number().int().positive(),
  baseRef: z.string().min(1),
  headRef: z.string().min(1),
  headSha: ObjectIdSchema,
});
export type IntegrationCheckpointTarget = z.infer<typeof IntegrationCheckpointTargetSchema>;

const NativeCheckpointOwnershipSchema = z.strictObject({ projectId: StoredUidSchema, workItemUid: StoredUidSchema });

export const IntegrationCheckpointCompositionRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("integration-checkpoint-composition/v1"),
  checkpointId: z.uuid(),
  workUnit: SlugSchema,
  approvedHead: ObjectIdSchema,
  target: IntegrationCheckpointTargetSchema,
  lifecycleVersion: z.string().min(1),
  nativeOwnership: NativeCheckpointOwnershipSchema.optional(),
  settlementPlan: CanonicalSettlementPlanSchema,
  mergeMethod: ValidatedMergeMethodSchema,
  compositionDigest: DigestSchema,
}).superRefine((record, context) => {
  if (record.target.headSha !== record.approvedHead) {
    context.addIssue({
      code: "custom",
      path: ["target", "headSha"],
      message: "must match the approved checkpoint head",
    });
  }
});
export type IntegrationCheckpointCompositionRecord = z.infer<
  typeof IntegrationCheckpointCompositionRecordSchema
>;

/** A persisted checkpoint does not match the approval handle used to read it. */
export class IntegrationCheckpointMismatchError extends Error {
  constructor() {
    super("The persisted integration checkpoint does not match its handle.");
    this.name = "IntegrationCheckpointMismatchError";
  }
}

export interface IntegrationCheckpointCompositionInput {
  workUnit: string;
  approvedHead: string;
  target: IntegrationCheckpointTarget;
  lifecycleVersion: string;
  nativeOwnership?: z.infer<typeof NativeCheckpointOwnershipSchema>;
  settlementPlan: z.infer<typeof CanonicalSettlementPlanSchema>;
  mergeMethod: z.infer<typeof ValidatedMergeMethodSchema>;
}

export interface IntegrationCheckpointStoreFs {
  readFile(path: string): Promise<string>;
  createFile(path: string, content: string): Promise<void>;
  /** The names of a folder's subfolders. */
  listDirectories(path: string): Promise<string[]>;
}

/**
 * Where checkpoint records live. Before the flip a work unit's workspace holds them, matched by slug; on the store path
 * the identity's machine-local folder holds one folder per work item, matched by UID, so a rename leaves them in place.
 */
export type IntegrationCheckpointLocation =
  | { kind: "workspace"; root: string; workUnit: string }
  | { kind: "identity"; root: string };

export interface IntegrationCheckpointStoreDependencies {
  fs: IntegrationCheckpointStoreFs;
  randomId(): string;
}

const nodeStoreDependencies: IntegrationCheckpointStoreDependencies = {
  fs: {
    readFile: (path) => readFile(path, "utf8"),
    createFile: atomicCreateFile,
    listDirectories: async (path) => (await readdir(path, { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name),
  },
  randomId: randomUUID,
};

function digestComposition(input: {
  checkpointId: string;
  workUnit: string;
  target: IntegrationCheckpointTarget;
  lifecycleVersion: string;
  nativeOwnership?: z.infer<typeof NativeCheckpointOwnershipSchema>;
  settlementPlan: z.infer<typeof CanonicalSettlementPlanSchema>;
  mergeMethod: z.infer<typeof ValidatedMergeMethodSchema>;
}): string {
  return canonicalDigest({
    domain: "arc.integration-checkpoint-composition/v1",
    checkpointId: input.checkpointId,
    workUnit: input.workUnit,
    target: input.target,
    lifecycleVersion: input.lifecycleVersion,
    ...(input.nativeOwnership === undefined ? {} : { nativeOwnership: input.nativeOwnership }),
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

function recordFolder(root: string): string {
  return join(root, ".internal", "integration-checkpoints");
}

function recordFile(handle: string): string {
  return `${parseHandle(handle).digest.slice("sha256:".length)}.json`;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function readIfPresent(fs: IntegrationCheckpointStoreFs, path: string): Promise<string | null> {
  try { return await fs.readFile(path); } catch (error) { if (isMissing(error)) return null; throw error; }
}

/**
 * Resolve the native checkpoint location in the primary worktree, or the workspace in the invoking checkout.
 */
export async function integrationCheckpointLocation(input: {
  cwd: string; identity: Slug; workUnit: string; store: Pick<Store, "capabilities">; exec: GitExec;
}): Promise<IntegrationCheckpointLocation> {
  const { cwd, identity, workUnit, store, exec } = input;
  if (store.capabilities.stateOffBranch) {
    const surfaces = await resolveUserSurfaceResolver({
      cwd, identity, exec: (cmd, args, options) => exec(cmd, args, { ...options, cwd }),
    });
    return { kind: "identity", root: surfaces.identityGlobalRoot };
  }
  const surfaces = createUserSurfaceResolver({ cwd, identity });
  return { kind: "workspace", root: surfaces.workUnitRoot(SlugSchema.parse(workUnit)), workUnit };
}

function writePath(location: IntegrationCheckpointLocation, input: IntegrationCheckpointCompositionInput, handle: string): string {
  if (location.kind === "workspace") return join(recordFolder(location.root), recordFile(handle));
  const workItemUid = input.nativeOwnership?.workItemUid;
  if (workItemUid === undefined) throw new Error("A checkpoint on the store path needs the work item its record is filed under.");
  return join(recordFolder(location.root), workItemUid, recordFile(handle));
}

/** The record a handle names, with the work item whose folder holds it on the store path. */
async function locateRecord(location: IntegrationCheckpointLocation, handle: string, fs: IntegrationCheckpointStoreFs):
  Promise<{ content: string; workItemUid?: string } | null> {
  const folder = recordFolder(location.root), file = recordFile(handle);
  if (location.kind === "workspace") {
    const content = await readIfPresent(fs, join(folder, file));
    return content === null ? null : { content };
  }
  let workItems: string[];
  try { workItems = await fs.listDirectories(folder); } catch (error) { if (isMissing(error)) return null; throw error; }
  const found: { content: string; workItemUid: string }[] = [];
  for (const workItemUid of workItems.filter(name => StoredUidSchema.safeParse(name).success)) {
    const content = await readIfPresent(fs, join(folder, workItemUid, file));
    if (content !== null) found.push({ content, workItemUid });
  }
  if (found.length > 1) throw new Error("The integration checkpoint handle names records under more than one work item.");
  return found[0] ?? null;
}

/**
 * Persist one immutable checkpoint composition and return its opaque approval handle.
 *
 * @param location - Where the record is filed; on the store path its work-item binding names its folder.
 * @param input - Validated composition fields bound by the returned handle.
 * @param overrides - Optional deterministic persistence dependencies for tests or alternate hosts.
 * @returns The opaque handle for the create-only persisted composition.
 */
export async function persistIntegrationCheckpointComposition(
  location: IntegrationCheckpointLocation,
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
  await dependencies.fs.createFile(writePath(location, input, handle), canonicalize(record));
  return handle;
}

/**
 * Read one handle-keyed composition. In a workspace the record must name its work unit; on the store path its binding,
 * where it carries one, must name the work item whose folder holds it.
 *
 * @param location - Where the record is filed.
 * @param handle - Opaque handle carrying the expected head and composition digest.
 * @param fs - Filesystem reader used to load the immutable record.
 * @returns The validated record, or null when the handle-keyed file is absent.
 */
export async function readIntegrationCheckpointComposition(
  location: IntegrationCheckpointLocation,
  handle: string,
  fs: IntegrationCheckpointStoreFs = nodeStoreDependencies.fs,
): Promise<IntegrationCheckpointCompositionRecord | null> {
  const located = await locateRecord(location, handle, fs);
  if (located === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(located.content) as unknown;
  } catch (error) {
    throw new Error("The persisted integration checkpoint is malformed.", { cause: error });
  }
  const record = IntegrationCheckpointCompositionRecordSchema.parse(value);
  const parsedHandle = parseHandle(handle);
  const expectedDigest = digestComposition(record);
  if (
    !filedUnder(record, location, located.workItemUid)
    || record.approvedHead !== parsedHandle.approvedHead
    || record.target.headSha !== record.approvedHead
    || record.compositionDigest !== parsedHandle.digest
    || record.compositionDigest !== expectedDigest
  ) {
    throw new IntegrationCheckpointMismatchError();
  }
  return record;
}

function filedUnder(record: IntegrationCheckpointCompositionRecord, location: IntegrationCheckpointLocation,
  workItemUid: string | undefined): boolean {
  if (location.kind === "workspace") return record.workUnit === SlugSchema.parse(location.workUnit);
  return record.nativeOwnership === undefined || record.nativeOwnership.workItemUid === workItemUid;
}
