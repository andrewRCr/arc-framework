/** JSON-RPC envelopes and per-line decoding for runner conversations. */
import { z } from "zod";
import { PrepareParamsSchema, RunParamsSchema, RunGroupParamsSchema, CancelParamsSchema, ReleaseParamsSchema,
  RecoveryParamsSchema, OutputParamsSchema, OutcomeParamsSchema, RunnerMessageTextSchema } from "./contract-operations.js";
import { OpaqueIdSchema } from "./contract-execution.js";

function requestSchema<const Method extends string, Params extends z.ZodType>(method: Method, params: Params) {
  return z.strictObject({ jsonrpc: z.literal("2.0"), id: OpaqueIdSchema, method: z.literal(method), params });
}
function notificationSchema<const Method extends string, Params extends z.ZodType>(method: Method, params: Params) {
  return z.strictObject({ jsonrpc: z.literal("2.0"), method: z.literal(method), params });
}

/** Supported caller operation requests. */
export const RunnerRequestSchema = z.discriminatedUnion("method", [
  requestSchema("check/prepare", PrepareParamsSchema), requestSchema("check/run", RunParamsSchema),
  requestSchema("check/runGroup", RunGroupParamsSchema), requestSchema("check/cancel", CancelParamsSchema),
  requestSchema("check/release", ReleaseParamsSchema),
]);
/** Correlated result-or-error reply envelope. */
export const RunnerReplySchema = z.union([
  z.strictObject({ jsonrpc: z.literal("2.0"), id: OpaqueIdSchema,
    error: z.strictObject({ code: z.int(), message: RunnerMessageTextSchema, data: z.unknown().optional() }) }),
  z.strictObject({ jsonrpc: z.literal("2.0"), id: OpaqueIdSchema, result: z.unknown() }),
]);
/** Supported adapter notifications, with no RPC request ID. */
export const RunnerNotificationSchema = z.discriminatedUnion("method", [
  notificationSchema("check/recovery", RecoveryParamsSchema), notificationSchema("check/output", OutputParamsSchema),
  notificationSchema("check/outcome", OutcomeParamsSchema),
]);
/** One non-batch protocol message. */
export const RunnerMessageSchema = z.union([RunnerRequestSchema, RunnerReplySchema, RunnerNotificationSchema]);
/** Validated protocol message. */
export type RunnerMessage = z.infer<typeof RunnerMessageSchema>;
/** One supported caller request with its operation-specific payload. */
export type RunnerRequest = z.infer<typeof RunnerRequestSchema>;
/** Result-or-error reply whose ID must still match an outstanding request. */
export type RunnerReply = z.infer<typeof RunnerReplySchema>;
/** One supported adapter notification. */
export type RunnerNotification = z.infer<typeof RunnerNotificationSchema>;

const INVALID_MESSAGE = "Runner emitted an invalid JSON-RPC line; repair the runner and retry the check request.";

/** Decode one delimiter-free JSON-RPC line without exposing payloads in errors. */
export function parseRunnerMessage(line: string): RunnerMessage {
  if (/[\r\n]/u.test(line)) throw new Error(INVALID_MESSAGE);
  let value: unknown;
  try { value = JSON.parse(line); } catch { throw new Error(INVALID_MESSAGE); }
  const parsed = RunnerMessageSchema.safeParse(value);
  if (!parsed.success) throw new Error(INVALID_MESSAGE);
  return parsed.data;
}
