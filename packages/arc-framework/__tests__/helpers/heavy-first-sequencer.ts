/** Deterministic duration-balanced shard assignment and slowest-first native ordering. */
import { relative } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BaseSequencer, type TestSpecification, type Vitest } from "vitest/node";
import { z } from "zod";
import { PROJECT_DURATION_ESTIMATES, SERIAL_PROJECT_WEIGHTS } from "./heavy-first-durations.js";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

/** One run's recorded durations, measured project fallback weights, and serial projects' recorded multipliers. */
export interface DurationSource {
  readonly recorded: ReadonlyMap<string, unknown>;
  readonly estimates: Readonly<Record<string, number>>;
  readonly serialWeights?: Readonly<Record<string, number>>;
}

function recordedDuration(source: DurationSource, project: string, file: string): number | undefined {
  const duration = source.recorded.get(`${project}:${file}`);
  return typeof duration === "number" && Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}

/** A file's share of its shard: its recorded duration, scaled when its project runs serially, or its project estimate. */
function shardWeight(source: DurationSource, project: string, file: string): number {
  const duration = recordedDuration(source, project, file);
  if (duration === undefined) return source.estimates[project] ?? 0;
  return duration * (source.serialWeights?.[project] ?? 1);
}

function lexical(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

/**
 * Prioritize recorded durations while keeping the native order for unrecorded files.
 * @param base - Native base-sequencer order
 * @param source - One shared duration input
 * @param identify - Stable project/path identity
 * @returns Recorded files followed by the untouched unrecorded order
 */
export function sortDurationFiles<T>(base: readonly T[], source: DurationSource,
  identify: (entry: T) => { project: string; file: string }): T[] {
  const files = base.map((entry) => {
    const { project, file } = identify(entry);
    return { entry, duration: recordedDuration(source, project, file) };
  });
  const recorded = files.filter((file) => file.duration !== undefined)
    .sort((left, right) => right.duration! - left.duration!);
  return [...recorded, ...files.filter((file) => file.duration === undefined)].map((file) => file.entry);
}

/**
 * Read one handed native results file without consulting Vitest's writable cache.
 * @param content - Native results JSON or an empty initial file
 * @returns Recorded duration values keyed by complete project/path identity
 */
export function readResultsDurations(content: string): ReadonlyMap<string, unknown> {
  if (content.trim().length === 0) return new Map();
  const native = z.object({ results: z.array(z.tuple([z.string(), z.object({ duration: z.unknown() })])) })
    .parse(JSON.parse(content));
  return new Map(native.results.map(([key, value]) => [key, value.duration]));
}

function loadDurationSource(env: NodeJS.ProcessEnv): DurationSource {
  const recorded = env.ARC_TEST_DURATION_FILE ? readResultsDurations(readFileSync(env.ARC_TEST_DURATION_FILE, "utf8"))
    : new Map<string, unknown>();
  return { recorded, estimates: PROJECT_DURATION_ESTIMATES, serialWeights: SERIAL_PROJECT_WEIGHTS };
}

/**
 * Partition specifications by descending weight and stable identity.
 * @param files - Specifications in arbitrary discovery order
 * @param count - Number of shards
 * @param source - One shared duration input
 * @param identify - Project and package-relative path for an entry
 * @returns Disjoint shard sets, indexed from zero
 */
export function assignDurationShards<T>(files: readonly T[], count: number, source: DurationSource,
  identify: (entry: T) => { project: string; file: string }): T[][] {
  const shards: T[][] = Array.from({ length: count }, () => []);
  const loads = shards.map(() => 0);
  const ordered = files.map((entry) => {
    const identity = identify(entry);
    return { entry, ...identity, weight: shardWeight(source, identity.project, identity.file) };
  }).sort((left, right) => right.weight - left.weight || lexical(left.project, right.project) || lexical(left.file, right.file));
  for (const file of ordered) {
    let target = 0;
    for (let index = 1; index < count; index++) if (loads[index]! < loads[target]!) target = index;
    shards[target]!.push(file.entry);
    loads[target]! += file.weight;
  }
  return shards;
}

/** Assign and start files from one immutable duration source per native controller. */
export class HeavyFirstSequencer extends BaseSequencer {
  constructor(ctx: Vitest, private readonly durations: DurationSource = loadDurationSource(process.env)) { super(ctx); }

  private identify(specification: TestSpecification): { project: string; file: string } {
    return { project: specification.project.name,
      file: relative(packageRoot, specification.moduleId).replaceAll("\\", "/") };
  }

  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { index, count } = this.ctx.config.shard!;
    return assignDurationShards(files, count, this.durations, (file) => this.identify(file))[index - 1]!;
  }

  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return sortDurationFiles(await super.sort(files), this.durations, (file) => this.identify(file));
  }
}
