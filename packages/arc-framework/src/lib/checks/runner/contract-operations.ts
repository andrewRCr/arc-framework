/** Preparation, execution, notification and lifetime payloads for runner operations. */
import { z } from "zod";
import { SourceCoordinatesSchema } from "./contract-source.js";
import { ArtifactPathSchema, CapturedEnvironmentSchema, InvocationSchema, OpaqueIdSchema, ProbeSchema } from "./contract-execution.js";
import { CanonicalDigestSchema } from "../../kernel/schema/vocabulary.js";
import { isWellFormedUnicode } from "../../kernel/canonical/unicode.js";

/** Maximum decoded bytes in one execution-output chunk. */
export const RUNNER_OUTPUT_CHUNK_BYTES = 64 * 1024;
/** Nonblank diagnostic text, preserved without trimming. */
export const RunnerMessageTextSchema = z.string().refine(value => value.trim().length > 0);
const InvocationIdsSchema = z.array(OpaqueIdSchema).refine(unique);
const OutputChunkSchema = z.string().refine(validOutputChunk);

function unique(ids: readonly string[]): boolean { return new Set(ids).size === ids.length; }

function validOutputChunk(data: string): boolean {
  if (data.length > Math.ceil(RUNNER_OUTPUT_CHUNK_BYTES / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/u.test(data)) return false;
  const decoded = Buffer.from(data, "base64");
  return decoded.length <= RUNNER_OUTPUT_CHUNK_BYTES
    && decoded.toString("base64").replace(/=+$/u, "") === data.replace(/=+$/u, "");
}

/** A fixed attempt's source, captured environment, probes and commands; invocation and probe IDs are each unique. */
export const PrepareParamsSchema = z.strictObject({ protocolVersion: z.literal(1), planId: z.uuid(),
  source: z.strictObject({ root: ArtifactPathSchema, manifest: ArtifactPathSchema, digest: CanonicalDigestSchema, coordinates: SourceCoordinatesSchema }),
  environment: CapturedEnvironmentSchema, probes: z.strictObject({ global: z.array(ProbeSchema), check: z.array(ProbeSchema) }),
  invocations: z.array(InvocationSchema),
}).refine(params => unique(params.invocations.map(invocation => invocation.id))
  && unique([...params.probes.global, ...params.probes.check].map(probe => probe.id)));
/** Applicable execution environments or an explicit inability to qualify reuse. */
export const QualifiedRuntimeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("unknown"), reason: RunnerMessageTextSchema }),
  z.strictObject({ kind: z.literal("known"), bindings: z.array(z.strictObject({ invocationId: OpaqueIdSchema, identity: CanonicalDigestSchema,
    probes: z.array(z.strictObject({ id: OpaqueIdSchema, stdout: z.string().refine(isWellFormedUnicode) })),
  })) }),
]);
/** Ready context or settled preparation unavailability. */
export const PrepareResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ready"), planId: z.uuid(), contextId: OpaqueIdSchema, sourceDigest: CanonicalDigestSchema,
    runtime: QualifiedRuntimeSchema, capabilities: z.strictObject({ runGroup: z.boolean() }) }),
  z.strictObject({ status: z.literal("unavailable"), planId: z.uuid(), reason: RunnerMessageTextSchema, remedy: RunnerMessageTextSchema, settled: z.literal(true) }),
]);
/** Exact native completion, unavailability or cancellation. */
export const TerminalOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("completed"), exitCode: z.int().min(0).max(0xFFFFFFFF), notice: z.string().optional(), notRunReason: z.string().optional() }),
  z.strictObject({ status: z.literal("unavailable"), reason: RunnerMessageTextSchema, remedy: RunnerMessageTextSchema }),
  z.strictObject({ status: z.literal("cancelled"), reason: RunnerMessageTextSchema }),
]);
/** One fixed invocation selected for execution. */
export const RunParamsSchema = z.strictObject({ contextId: OpaqueIdSchema, invocationId: OpaqueIdSchema });
/** An explicitly requested optional group of fixed invocations. */
export const RunGroupParamsSchema = z.strictObject({ contextId: OpaqueIdSchema, invocationIds: InvocationIdsSchema });
/** Cancellation coordinates, including preparation before a context exists. */
export const CancelParamsSchema = z.strictObject({ planId: z.uuid(), contextId: OpaqueIdSchema.optional() });
/** Context whose lifetime is ready to close. */
export const ReleaseParamsSchema = z.strictObject({ contextId: OpaqueIdSchema });
/** Settlement after all requested outcomes and required output. */
export const SettledRunResultSchema = z.strictObject({ contextId: OpaqueIdSchema, settled: z.literal(true), outputComplete: z.literal(true), invocationIds: InvocationIdsSchema });
/** Cancellation acknowledgement without settlement authority. */
export const CancelResultSchema = z.strictObject({ planId: z.uuid(), accepted: z.literal(true) });
/** Closed context, optionally retaining a disposable-cleanup warning. */
export const ReleaseResultSchema = z.strictObject({ contextId: OpaqueIdSchema, released: z.literal(true), cleanupWarning: RunnerMessageTextSchema.optional() });
/** Caller-known recovery procedure retained before work can outlive the conversation. */
export const RecoveryParamsSchema = z.strictObject({ planId: z.uuid(), instructions: RunnerMessageTextSchema });
/** Bounded binary execution-output chunk. */
export const OutputParamsSchema = z.strictObject({ contextId: OpaqueIdSchema, invocationId: OpaqueIdSchema, stream: z.enum(["stdout", "stderr"]), dataBase64: OutputChunkSchema });
/** Immutable terminal outcome for one requested invocation. */
export const OutcomeParamsSchema = z.strictObject({ contextId: OpaqueIdSchema, invocationId: OpaqueIdSchema, outcome: TerminalOutcomeSchema });

/** Fixed preparation request. */
export type PrepareParams = z.infer<typeof PrepareParamsSchema>;

/** Known per-invocation qualification or explicit unknown runtime. */
export type QualifiedRuntime = z.infer<typeof QualifiedRuntimeSchema>;

/** Ready context or settled no-context preparation result. */
export type PrepareResult = z.infer<typeof PrepareResultSchema>;

/** Native completion, unavailability or cancellation. */
export type TerminalOutcome = z.infer<typeof TerminalOutcomeSchema>;

/** One requested fixed invocation. */
export type RunParams = z.infer<typeof RunParamsSchema>;

/** An optional requested invocation set. */
export type RunGroupParams = z.infer<typeof RunGroupParamsSchema>;

/** Attempt/context cancellation request. */
export type CancelParams = z.infer<typeof CancelParamsSchema>;

/** Context release request. */
export type ReleaseParams = z.infer<typeof ReleaseParamsSchema>;

/** Complete output and settlement for a requested invocation set. */
export type SettledRunResult = z.infer<typeof SettledRunResultSchema>;

/** Cancellation acknowledgement. */
export type CancelResult = z.infer<typeof CancelResultSchema>;

/** Context release acknowledgement and advisory cleanup result. */
export type ReleaseResult = z.infer<typeof ReleaseResultSchema>;

/** Attempt recovery instructions. */
export type RecoveryParams = z.infer<typeof RecoveryParamsSchema>;

/** One bounded output notification. */
export type OutputParams = z.infer<typeof OutputParamsSchema>;

/** One terminal invocation notification. */
export type OutcomeParams = z.infer<typeof OutcomeParamsSchema>;
