/** Capture the checkout-only selectors that atomic admission must never reopen. */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ProjectionAdmissionSchema, type ProjectionAdmission } from "../projection-admission.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionLocation } from "./location.js";
import type { StoreResult } from "../refusal.js";
import { decodeWorktreeMarkerOwnership, readWorktreeMarker } from "../../git/worktree-marker.js";
import { readProjectionIndex } from "./index-file.js";
import { loadProjectionGroups, projectionIndexGroup } from "./index-memory.js";
import { readProjectionLinkBoundary, projectionLinkRemedy } from "./discovery-links.js";
import { projectionCandidateContainers } from "./container-ownership.js";
import { resolveArcPath } from "../../layout/index.js";
import { gateRead } from "./read-gate.js";
import { parseStampedFile } from "./stamp.js";
import type { RecordReference } from "../identity.js";

type Local = ProjectionAdmission["local"];
/** Effective configuration captured independently of the current store view. */
export type ProjectionLocalSettings = ProjectionIndex["projectedUnder"];
/** Frozen local evidence and the identity that supplied it. */
export interface ProjectionLocalCapture {
  readonly identity: ProjectionAdmission["editingIdentity"];
  readonly local: Local;
  readonly binding: RecordReference | null;
}
/** Local adapters may provide fresh configuration while standalone readers use their indexed settings. */
export interface ProjectionLocalCaptureInput {
  readonly checkout: string;
  readonly path: string;
  readonly source: "file" | "aside";
  readonly location: ProjectionLocation;
  readonly settings?: ProjectionLocalSettings;
  readonly index?: ProjectionIndex;
}

/** Capture every local candidate position, treating unreadable evidence differently from absence. */
export async function captureProjectionLocal(input: ProjectionLocalCaptureInput): Promise<StoreResult<ProjectionLocalCapture>> {
  const disk = input.index ? null : await readProjectionIndex(input.location, true);
  const index = input.index ?? (disk?.kind === "index" ? disk.index : null);
  const settings = input.settings ?? index?.projectedUnder;
  if (!settings) return refusedLocal("The projection settings and ownership basis are unavailable.");
  if (index !== null) loadProjectionGroups(index, [projectionIndexGroup(input.path)]);
  const entry = index?.entries[input.path];
  const binding = entry?.kind === "record" ? entry.reference : entry?.minted?.reference ?? null;
  const marker = await readWorktreeMarker(input.checkout);
  if (marker.kind === "malformed") return refusedLocal(marker.message);
  const localMarker = marker.kind === "absent" ? null
    : { ...decodeWorktreeMarkerOwnership(marker.marker), husk: marker.marker.husk !== undefined };
  const prospective: Local["prospectiveMetadata"] = [];
  for (const container of index?.entries[input.path]?.kind === "record" ? [] : projectionCandidateContainers(input.path)) {
    const path = resolveArcPath({ kind: "work-unit-artifact", slug: container.slug, placement: container.placement, artifact: "meta" });
    const captured = await captureProspectiveMetadata(input.checkout, path);
    if (captured.status === "refused") return captured;
    prospective.push({ path, content: captured.result });
  }
  const indexed = Object.entries(index?.entries ?? {}).flatMap(([path, entry]) => {
    const reference = entry.kind === "record" ? entry.reference : entry.minted?.reference;
    return reference?.kind === "work-item/meta" && input.path.startsWith(`${dirname(path).replaceAll("\\", "/")}/`)
      ? [{ path, reference }] : [];
  }).sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  return { status: "ok", result: { identity: settings.identity, binding, local: ProjectionAdmissionSchema.shape.local.parse({ path: input.path, source: input.source,
    claim: settings.claim, layoutActive: settings.layoutActive, viewInFlight: settings.view, marker: localMarker,
    indexedMetadata: indexed, prospectiveMetadata: prospective }) } };
}

async function captureProspectiveMetadata(checkout: string, path: string): Promise<StoreResult<string | null>> {
  const boundary = await readProjectionLinkBoundary(checkout, [path]);
  const linked = boundary(path);
  if (linked !== null) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
    rule: "projection.local", condition: `The candidate metadata path traverses symbolic link ${linked}.`, remedy: projectionLinkRemedy(linked) } };
  const gate = await gateRead({ path: join(checkout, path), markdown: false });
  if (gate.kind === "absent") return { status: "ok", result: null };
  if (gate.kind !== "read") return refusedLocal(`The candidate metadata at ${path} is not a settled regular file.`);
  try { return { status: "ok", result: parseStampedFile(await readFile(join(checkout, path), "utf8")).content }; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR" && code !== "EACCES" && code !== "EPERM") throw error;
    return refusedLocal(`The candidate metadata at ${path} changed or became unreadable during capture.`);
  }
}

function refusedLocal(condition: string): StoreResult<never> {
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", rule: "projection.local", condition,
    remedy: { text: "Restore settled, readable local ownership evidence and prepare this file again." } } };
}
