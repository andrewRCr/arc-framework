/** Structured qualification observations emitted by native controllers, separate from generic runner outcomes. */
import { z } from "zod";

const member = z.object({ project: z.string(), file: z.string() });
const duration = z.union([
  z.object({ kind: z.literal("file"), state: z.enum(["unset", "empty"]) }),
  z.object({ kind: z.literal("file"), state: z.literal("file"), digest: z.string().regex(/^sha256:[a-f0-9]{64}$/u), bytes: z.int().nonnegative() }),
]);
export const NativeShardObservationSchema = z.object({
  cycle: z.int().positive(),
  shard: z.object({ index: z.int().positive(), count: z.int().positive() }).optional(),
  runtime: z.object({ node: z.string().regex(/^v\d+\.\d+\.\d+/u), vitest: z.string().regex(/^\d+\.\d+\.\d+/u),
    platform: z.string().min(1), arch: z.string().min(1) }),
  duration,
  selected: z.array(member), assigned: z.array(member), ordered: z.array(member),
  queued: z.array(member), ended: z.array(member),
  shardCalls: z.int().nonnegative(), sortCalls: z.int().nonnegative(),
});
export type NativeMember = z.infer<typeof member>;
export type NativeShardObservation = z.infer<typeof NativeShardObservationSchema>;
export type NativeRuntimeProfile = NativeShardObservation["runtime"];
export type NativeDurationInput = z.infer<typeof duration>;
export const nativeObservationPrefix = "ARC_NATIVE_SHARD_OBSERVATION ";

/** Read only the qualification reporter's structured observations from native stdout. */
export function readNativeShardObservations(stdout: string): NativeShardObservation[] {
  return stdout.split(/\r?\n/u).filter(line => line.startsWith(nativeObservationPrefix))
    .map(line => NativeShardObservationSchema.parse(JSON.parse(line.slice(nativeObservationPrefix.length))));
}
