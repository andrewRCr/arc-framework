/** Bind an explicit resolution to indexed identities before the command sweeps displaced files. */
import { formatConflictToken } from "../../status/conflict-token.js";
import { sameReference, type RecordReference } from "../identity.js";
import type { Store } from "../contract.js";
import { checkStoredResolution } from "./stored-resolution.js";
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { TakeInResolution } from "./take-in-port.js";
import { closedResolution, unmappedResolutionRefusal } from "./save-lookup.js";
import type { ProjectionRootState } from "./process-state.js";
import { projectionLinkRemedy } from "./discovery-links.js";
import { prepareWriteBack, type PreparedWriteBack } from "./write-back.js";

/** An exact indexed subject and its requested resolving write. */
export interface ProjectionResolutionTarget {
  readonly path: string;
  /** Every equivalent indexed path, including the selected path. */
  readonly aliases?: readonly string[];
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
  if (targets.every(each => equivalentTarget(each, target))) {
    const aliases = targets.map(each => each.path).sort();
    return { token, target: aliases.length === 1 ? target : { ...target, path: aliases[0] ?? target.path, aliases },
      accepted: false, refusal: null };
  }
  return { token, target: null, accepted: false, refusal: {
      reason: `Ambiguous conflict token ${token}: ${targets.map(each => `${each.path} (${JSON.stringify(each.subject)})`).join("; ")}.`,
      remedy: { text: "Use a checkout projecting only the intended owner UID, then retry the token there." },
    } };
}

function equivalentTarget(left: ProjectionResolutionTarget, right: ProjectionResolutionTarget): boolean {
  if (!sameReference(left.subject, right.subject)) return false;
  return left.resolution.kind === "stored" && right.resolution.kind === "stored"
    ? sameReference(left.resolution.reference, right.resolution.reference)
    : left.resolution.kind === "hold" && right.resolution.kind === "hold" && left.resolution.token === right.resolution.token;
}

/** Recheck the selected identity after the sweep, which may already have fulfilled the intent. */
export async function recheckProjectionResolution(root: ProjectionRootState, index: ProjectionIndex, intent: ProjectionResolution | null): Promise<void> {
  const { store } = root;
  const target = intent?.target;
  if (intent === null || target === null || target === undefined || intent.accepted) return;
  const entry = resolutionFile(root, index, target, target.path);
  if ("reason" in entry) { intent.refusal = entry; return; }
  if (target.resolution.kind === "hold") {
    intent.refusal = holdResolutionRefusal(entry, intent.token) ?? await aliasResolutionRefusal(root, index, target); return;
  }
  const read = await checkStoredResolution(store, target.subject, target.resolution.reference);
  if (read.status === "refused") {
    intent.refusal = read.refusal.code === "not-found" ? closedResolution(intent.token)
      : { reason: read.refusal.condition, remedy: read.refusal.remedy }; return;
  }
  intent.refusal = await aliasResolutionRefusal(root, index, target);
  // The subject's submitted content passes the ordinary hand-edit checks; discarded alternatives grant no authority.
}

function resolutionFile(root: ProjectionRootState, index: ProjectionIndex, target: ProjectionResolutionTarget,
  path: string): RecordEntry | RefusedMark {
  const link = root.blockedByLink(path);
  if (link !== null) return { reason: "not-a-file", remedy: projectionLinkRemedy(link) };
  const entry = index.entries[path];
  if (entry?.kind !== "record" || !sameReference(entry.reference, target.subject)) return {
    reason: `The resolution's subject has no projected file at ${path}.`,
    remedy: { text: `Retry from a checkout projecting ${JSON.stringify(target.subject.owner)}.` } };
  return entry.withheld ? { reason: `The resolution's subject ${path} is withheld.`,
    remedy: { text: "Copy out anything wanted, then delete the withheld file to release it before retrying." } } : entry;
}

async function aliasResolutionRefusal(root: ProjectionRootState, index: ProjectionIndex,
  target: ProjectionResolutionTarget): Promise<RefusedMark | null> {
  let content: string | undefined;
  for (const path of target.aliases ?? []) {
    const entry = resolutionFile(root, index, target, path);
    if ("reason" in entry) return entry;
    const request = { checkout: root.checkout, path, copy: null, entry, resolution: target.resolution,
      base: path.endsWith(".md") ? { kind: "stamp" as const, stamp: null } : { kind: "blob" as const, blob: entry.base.blob } };
    const denied = await root.rights?.(request);
    if (denied !== undefined && denied !== null) return denied;
    const prepared = await prepareWriteBack(root.context, request);
    if (prepared.kind !== "ready") return unreadyAlias(path, prepared);
    if (content !== undefined && content !== prepared.write.content) return {
      reason: `Projected resolution copies disagree: ${target.aliases?.join(", ")}.`,
      remedy: { text: "Make the projected copies agree on the intended resolution, then retry the same conflict token." } };
    content = prepared.write.content;
  }
  return null;
}

function unreadyAlias(path: string, prepared: Exclude<PreparedWriteBack, { kind: "ready" }>): RefusedMark {
  if (prepared.kind === "clashed") return { reason: `The resolution copy ${path} requires a checkout merge.`,
    remedy: { text: "Run arc save without --resolve to draw the checkout conflict, resolve its markers, make the copies agree, then retry the token.",
      argv: ["arc", "save"] } };
  return prepared.diagnostics?.[0] ?? prepared.diagnostic ?? ("mark" in prepared.result ? prepared.result.mark : {
    reason: `The resolution copy ${path} is not ready to send.`,
    remedy: { text: `Restore a settled regular file at ${path}, then retry the same conflict token.` },
  });
}

function holdResolutionRefusal(entry: RecordEntry, token: string): RefusedMark | null {
  return entry.refused?.reason === "bases-disagree" && entry.refused.remedy.argv?.at(-1) === token
    ? null : closedResolution(token);
}
