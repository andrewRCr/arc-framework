/** Shared deterministic shard arguments and canonical invocation coordinates. */
import { batchCheckPaths, batchPortableCheckPaths } from "./batching.js";
import type { CheckDeclaration } from "./declaration.js";

/** Stable position within a complete check plan, independent of wire identities. */
export interface CheckInvocationCoordinate {
  readonly batch: number;
  readonly shard?: Readonly<{ index: number; count: number }>;
}

/** Expand the declaration's one-based shard arguments in native order. */
export function checkShardArguments(shards: NonNullable<CheckDeclaration["checks"][string]["shards"]>): string[] {
  return Array.from({ length: shards.count }, (_, offset) => shards.argument
    .replaceAll("{index}", String(offset + 1)).replaceAll("{count}", String(shards.count)));
}

/** Append native final arguments while retaining the portable single-string shell representation. */
export function checkInvocationArguments(command: readonly string[], paths: readonly string[], suffix: string | undefined,
  shell: boolean): string[] {
  const argv = [...command, ...paths, ...(suffix === undefined ? [] : [suffix])];
  return shell ? [argv.join(" ")] : argv;
}

/** Partition paths once against the largest complete final command on the selected platform models. */
export function checkShardBatches(check: CheckDeclaration["checks"][string], command: readonly string[],
  paths: readonly string[], suffixes: readonly (string | undefined)[], platform?: NodeJS.Platform): string[][] {
  const suffix = suffixes.at(-1);
  const fixed = checkInvocationArguments(command, [], suffix, check.shell);
  const receivesPaths = check.mode !== "project" && check.pass_paths;
  const batches = platform === undefined
    ? batchPortableCheckPaths(fixed, receivesPaths ? paths : [], check.shell)
    : batchCheckPaths(fixed, receivesPaths ? paths : [], platform, check.shell);
  return receivesPaths ? batches : [[]];
}
