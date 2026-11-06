/** Bind an explicit resolution to indexed identities before the command sweeps displaced files. */
import { formatConflictToken } from "../../status/conflict-token.js";
import { sameReference, type RecordReference } from "../identity.js";
import type { Store } from "../contract.js";
import { ConflictRecordSchema, WholeRecordConflictSchema } from "../conflict.js";
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { TakeInResolution } from "./take-in-port.js";
import { closedResolution, unmappedResolutionRefusal } from "./save-lookup.js";
import type { ProjectionRootState } from "./process-state.js";
import { wholeRecordResolutionRefusal } from "./save-whole-record.js";
import { projectionLinkRemedy } from "./discovery-links.js";

/** An exact indexed subject and its requested resolving write. */
export interface ProjectionResolutionTarget {
  readonly path: string;
  readonly subject: RecordReference;
  readonly resolution: TakeInResolution;
}
/** Command-local intent and the outcome at the accepted-write boundary. */
export interface ProjectionResolution {
  readonly token: string;
  readonly target: ProjectionResolutionTarget | null;
  accepted: boolean;
  refusal: RefusedMark | null;
}

/** Find a token only through the index's UID-bearing mappings. */
export async function selectProjectionResolution(store: Store, index: ProjectionIndex | null, token: string): Promise<ProjectionResolution> {
  const holds: ProjectionResolutionTarget[] = [];
  for (const [path, entry] of Object.entries(index?.entries ?? {})) {
    if (entry.kind !== "record") continue;
    if (entry.refused?.reason === "bases-disagree" && entry.refused.remedy.argv?.at(-1) === token) {
      holds.push({ path, subject: entry.reference, resolution: { kind: "hold", token } });
    }
  }
  const hold = selectTarget(token, holds);
  if (hold !== null) return hold;
  const targets: ProjectionResolutionTarget[] = [];
  for (const [path, entry] of Object.entries(index?.entries ?? {})) {
    if (entry.kind !== "record") continue;
    const reference = [...entry.notices, ...entry.unshown,
      ...(entry.markers?.sets.flatMap(set => set.shows === "stored" ? [set.conflict] : []) ?? [])]
      .find(reference => formatConflictToken(reference) === token);
    if (reference !== undefined) targets.push({ path, subject: entry.reference, resolution: { kind: "stored", reference } });
  }
  return selectTarget(token, targets) ?? { token, target: null, accepted: false, refusal: await unmappedResolutionRefusal(store, token) };
}

function selectTarget(token: string, targets: readonly ProjectionResolutionTarget[]): ProjectionResolution | null {
  const target = targets[0];
  if (target === undefined) return null;
  return targets.length === 1 ? { token, target, accepted: false, refusal: null }
    : { token, target: null, accepted: false, refusal: {
      reason: `Ambiguous conflict token ${token}: ${targets.map(each => `${each.path} (${JSON.stringify(each.subject)})`).join("; ")}.`,
      remedy: { text: "Use a checkout projecting only the intended owner UID, then retry the token there." },
    } };
}

/** Recheck the selected identity after the sweep, which may already have fulfilled the intent. */
export async function recheckProjectionResolution(root: ProjectionRootState, index: ProjectionIndex, intent: ProjectionResolution | null): Promise<void> {
  const { store } = root;
  const target = intent?.target;
  if (intent === null || target === null || target === undefined || intent.accepted) return;
  const link = root.blockedByLink(target.path);
  if (link !== null) {
    intent.refusal = { reason: "not-a-file", remedy: projectionLinkRemedy(link) }; return;
  }
  const entry = index.entries[target.path];
  if (entry?.kind !== "record" || !sameReference(entry.reference, target.subject)) {
    intent.refusal = { reason: `The resolution's subject has no projected file at ${target.path}.`,
      remedy: { text: `Retry from a checkout projecting ${JSON.stringify(target.subject.owner)}.` } }; return;
  }
  if (entry.withheld) {
    intent.refusal = { reason: `The resolution's subject ${target.path} is withheld.`,
      remedy: { text: "Copy out anything wanted, then delete the withheld file to release it before retrying." } }; return;
  }
  if (target.resolution.kind === "hold") {
    intent.refusal = holdResolutionRefusal(entry, intent.token); return;
  }
  const read = await store.read({ reference: target.resolution.reference });
  if (read.status === "refused") {
    intent.refusal = read.refusal.code === "not-found" ? closedResolution(intent.token)
      : { reason: read.refusal.condition, remedy: read.refusal.remedy }; return;
  }
  let value: unknown;
  try { value = JSON.parse(read.result.content); } catch { value = null; }
  const conflict = ConflictRecordSchema.safeParse(value);
  intent.refusal = !conflict.success || !sameReference(conflict.data.record, target.subject)
    ? { reason: `The indexed conflict ${intent.token} does not identify a readable conflict on this subject.`,
      remedy: { text: "Repair the conflict record or restore its correct projection mapping, then retry." } } : null;
  const whole = WholeRecordConflictSchema.safeParse(conflict.success ? conflict.data : null);
  if (intent.refusal === null && whole.success) {
    intent.refusal = await wholeRecordResolutionRefusal(root.context, { checkout: root.checkout, path: target.path,
      copy: null, entry, base: { kind: "stamp", stamp: null } }, whole.data);
  }
}

function holdResolutionRefusal(entry: RecordEntry, token: string): RefusedMark | null {
  return entry.refused?.reason === "bases-disagree" && entry.refused.remedy.argv?.at(-1) === token
    ? null : closedResolution(token);
}
