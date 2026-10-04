/** Selective content identities for qualified development runtime generations. */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

/** Qualification record published beside the completed CLI entry. */
export const DEV_BUILD_STAMP_NAME = "dev-build-stamp.json";

/**
 * Recognize the required nonempty schema collection emitted by the schema producer.
 * @param value - Parsed staged or live schema artifact
 * @returns Whether the artifact supplies a usable schema collection
 */
export function hasKernelSchemas(value: unknown): boolean {
  return typeof value === "object" && value !== null && "schemas" in value
    && typeof value.schemas === "object" && value.schemas !== null && !Array.isArray(value.schemas)
    && Object.keys(value.schemas).length > 0;
}

const sourceKey = z.string().regex(/^(?!\/|[A-Za-z]:|.*(?:^|\/)\.\.(?:\/|$)|.*\\).+$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const sourceSet = z.array(sourceKey).min(1).refine((keys) => new Set(keys).size === keys.length);
const producerSet = sourceSet.refine((keys) => keys.every((key) =>
  !key.split("/").includes("node_modules") && /\.(?:[cm]?[jt]sx?|json)$/u.test(key)));

/** Disposable current-format evidence; old or malformed records never qualify output. */
export const BuildEvidenceSchema = z.object({
  schemaVersion: z.literal(2),
  generation: z.uuid(),
  graphs: z.object({ cli: producerSet, schema: producerSet, controls: producerSet }).strict(),
  configurationInputs: sourceSet,
  inventoryRoots: sourceSet,
  inventory: z.array(z.object({
    path: sourceKey, kind: z.enum(["file", "directory", "link"]), target: z.string().optional(),
  }).strict().refine((entry) => entry.kind === "link" ? entry.target !== undefined : entry.target === undefined)),
  identities: z.object({ runtime: digest, runtimeSchema: digest }).strict(),
  qualification: z.object({ published: z.literal(true), runtimeSchema: z.literal(true),
    declarations: z.boolean() }).strict(),
}).strict();

/** Qualified producer record published only after required live output is complete. */
export type BuildEvidence = z.infer<typeof BuildEvidenceSchema>;

/**
 * Read the current disposable record format without compatibility fallbacks.
 * @param value - Untrusted parsed local evidence
 * @returns Valid evidence or null, allowing the owning builder to repair it
 */
export function parseBuildEvidence(value: unknown): BuildEvidence | null {
  const parsed = BuildEvidenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Combine concrete installation/runtime and resolver-control identities.
 * @param context - Managed installation and runtime identity
 * @param inventory - Membership, links, and first-party manifest identity
 * @returns Shared control identity used by both producer closures
 */
export function sharedBuildIdentity(context: string, inventory: string): string {
  return createHash("sha256").update(context).update("\0").update(inventory).digest("hex");
}

/** Baseline and producer facts supplied by an owning generation coordinator. */
export interface BuildEvidenceInput {
  readonly graphs: BuildInputGraphs;
  readonly configurationInputs: readonly string[];
  readonly inventoryRoots: readonly string[];
  readonly inventory: BuildEvidence["inventory"];
  readonly contents: Readonly<Record<string, string>>;
  readonly sharedIdentity: string;
  readonly declarations: boolean;
}

/**
 * Compose validated evidence from a generation's stable baseline and actual graphs.
 * @param input - Verified generation facts
 * @returns Current evidence ready for publication after required output succeeds
 */
export function createBuildEvidence(input: BuildEvidenceInput): BuildEvidence {
  return BuildEvidenceSchema.parse({
    schemaVersion: 2, generation: randomUUID(), graphs: input.graphs,
    configurationInputs: input.configurationInputs, inventoryRoots: input.inventoryRoots, inventory: input.inventory,
    identities: identifyBuildInputs({ ...input.graphs,
      controls: [...input.graphs.controls, ...input.configurationInputs],
    }, input.contents, input.sharedIdentity),
    qualification: { published: true, runtimeSchema: true, declarations: input.declarations },
  });
}

/** Repository-relative source graphs captured from actual native producers. */
export interface BuildInputGraphs {
  readonly cli: readonly string[];
  readonly schema: readonly string[];
  readonly controls: readonly string[];
}

/** Distinct runtime and runtime-plus-schema content identities. */
export interface BuildInputIdentities {
  readonly runtime: string;
  readonly runtimeSchema: string;
}

/**
 * Hash producer-selected baseline contents together with shared loader controls.
 * @param graphs - Actual compiler, schema, and shared-control input sets
 * @param contents - Baseline content digests keyed relative to the repository
 * @param sharedIdentity - Configuration, installation, runtime, and resolver identity
 * @returns Selective runtime and test input hashes
 */
export function identifyBuildInputs(
  graphs: BuildInputGraphs,
  contents: Readonly<Record<string, string>>,
  sharedIdentity: string,
): BuildInputIdentities {
  const runtime = [...graphs.cli, ...graphs.controls];
  return {
    runtime: hashInputSet(runtime, contents, sharedIdentity),
    runtimeSchema: hashInputSet([...runtime, ...graphs.schema], contents, sharedIdentity),
  };
}

function hashInputSet(inputs: readonly string[], contents: Readonly<Record<string, string>>, shared: string): string {
  const hash = createHash("sha256").update(shared).update("\0");
  for (const key of [...new Set(inputs)].sort()) {
    const content = contents[key];
    if (content === undefined) throw new Error(`Build input ${key} was absent from the baseline; rerun the build.`);
    hash.update(key).update("\0").update(content).update("\0");
  }
  return hash.digest("hex");
}
