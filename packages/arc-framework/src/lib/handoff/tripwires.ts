/** Bounded growth and publication contention reports over backend measurements. */
import { z } from "zod";
import { FAMILY_REGISTRY } from "../store/registry.js";
import type { MaintainResult, RefMeasurement } from "../store/operational-sync.js";
/** Strict advisory bounds, independent of project preferences. */
export const GROWTH_COMMIT_BOUND = 2_000;
export const GROWTH_DISK_BYTES_BOUND = 50_000_000;
export const PUSH_RETRY_BOUND = 1;
export const PUSH_WAIT_MS_BOUND = 10_000;
const GrowthTripwireSchema = z.strictObject({ ref: z.string().min(1), commits: z.number().int().gt(GROWTH_COMMIT_BOUND).optional(),
  diskBytes: z.number().int().gt(GROWTH_DISK_BYTES_BOUND).optional(), text: z.string().min(1) })
  .refine(value => value.commits !== undefined || value.diskBytes !== undefined, "A growth report names an exceeded figure");
const ContentionTripwireSchema = z.strictObject({ retryCount: z.number().int().gt(PUSH_RETRY_BOUND).optional(),
  waitedMs: z.number().gt(PUSH_WAIT_MS_BOUND).optional(), text: z.string().min(1) })
  .refine(value => value.retryCount !== undefined || value.waitedMs !== undefined, "A contention report names an exceeded figure");
/** Wire authority reports only figures exceeding their applicable bound. */
export const HandoffTripwireReportSchema = z.strictObject({ growth: z.array(GrowthTripwireSchema), contention: ContentionTripwireSchema.nullable() });
export type HandoffTripwireReport = z.infer<typeof HandoffTripwireReportSchema>;
/** Actual backend measurements and one measured publish outcome; neither triggers I/O. */
export interface HandoffTripwireInput { maintenance?: MaintainResult; push?: { retryCount: number; waitedMs: number } }
/** Report deferred scale capabilities only when measured bounds have been exceeded. */
export function reportHandoffTripwires(input: HandoffTripwireInput): HandoffTripwireReport {
  return { growth: (input.maintenance?.measurements ?? []).flatMap(growthTripwire), contention: contentionTripwire(input.push) };
}

function growthTripwire(measurement: RefMeasurement): HandoffTripwireReport["growth"] {
  if (!isNeverRetiringRef(measurement.ref)) return [];
  const commits = measurement.commits > GROWTH_COMMIT_BOUND ? measurement.commits : undefined;
  const diskBytes = measurement.diskBytes > GROWTH_DISK_BYTES_BOUND ? measurement.diskBytes : undefined;
  if (commits === undefined && diskBytes === undefined) return [];
  const figures = [...(commits === undefined ? [] : [`${commits} commits`]), ...(diskBytes === undefined ? [] : [`${diskBytes} bytes on disk`])];
  return [{ ref: measurement.ref, ...(commits === undefined ? {} : { commits }), ...(diskBytes === undefined ? {} : { diskBytes }),
    text: `Ref ${measurement.ref} exceeds the growth bound (${figures.join(", ")}). Consider scheduled ref rotation.` }];
}

function isNeverRetiringRef(ref: string): boolean {
  const parts = ref.split("/");
  return (["personal", "claims", "project-inbox", "project-registry"] as const).some(family => {
    const placement = FAMILY_REGISTRY[family].ref;
    if (placement === null || !("pattern" in placement)) return false;
    const pattern = placement.pattern.split("/");
    return parts.length === pattern.length && pattern.every((part, index) => part === "<id>" ? (parts[index]?.length ?? 0) > 0 : part === parts[index]);
  });
}

function contentionTripwire(push: HandoffTripwireInput["push"]): HandoffTripwireReport["contention"] {
  if (push === undefined) return null;
  const retryCount = push.retryCount > PUSH_RETRY_BOUND ? push.retryCount : undefined;
  const waitedMs = push.waitedMs > PUSH_WAIT_MS_BOUND ? push.waitedMs : undefined;
  if (retryCount === undefined && waitedMs === undefined) return null;
  const figures = [...(retryCount === undefined ? [] : [`${retryCount} retries`]), ...(waitedMs === undefined ? [] : [`${waitedMs} ms waited`])];
  return { ...(retryCount === undefined ? {} : { retryCount }), ...(waitedMs === undefined ? {} : { waitedMs }),
    text: `Push contention exceeds its bound (${figures.join(", ")}). Consider a service backend, per-record authorization, or very high write parallelism.` };
}
