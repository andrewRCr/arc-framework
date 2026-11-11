/** Read and summarize outstanding projection state without changing its index. */
import type { Store } from "../contract.js";
import type { RecordReference } from "../identity.js";
import type { Remedy } from "../refusal.js";
import { locateProjection, type ProjectionLocation } from "./location.js";
import { createProjectionEnginePorts, type ProjectionEnginePorts } from "./engine-ports.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import { readProjectionIndex, type UnusableIndexCause } from "./index-file.js";
import { parseAsideFile } from "./aside.js";
import { formatConflictToken } from "../../status/conflict-token.js";
import { renderRemedyArgument } from "../../../scripts/integration/spine-refusal.js";
import { projectionTripwires, formatProjectionTripwire, type ProjectionTripwire } from "./timings.js";

/** A projected file with outstanding state, omitting filesystem stats from the JSON view. */
export interface ProjectionFileStatus {
  readonly path: string;
  readonly ownerless: boolean;
  readonly pending: boolean;
  readonly withheld: boolean;
  readonly refused: RefusedMark | null;
  readonly unshown: readonly RecordReference[];
}

/** One retained aside copy and its original path when the index or its name identifies it. */
export interface ProjectionCopyStatus {
  readonly path: string | null;
  readonly copy: string;
  readonly withheld: boolean;
}

/** Desired in-flight settings and diagnostics independent of index readability. */
export interface ProjectionViewStatus {
  readonly mode: ProjectionIndex["projectedUnder"]["view"]["mode"];
  readonly pins: readonly string[];
  readonly diagnostics: readonly RefusedMark[];
}

type RecordedProjectionStatus =
  | { readonly kind: "no-projection" }
  | { readonly kind: "unusable"; readonly cause: UnusableIndexCause; readonly remedy: Remedy }
  | { readonly kind: "ready"; readonly files: readonly ProjectionFileStatus[]; readonly copies: readonly ProjectionCopyStatus[];
    readonly tripwires?: readonly ProjectionTripwire[] };

/** Read-only projection information carried by composite status. */
export type ProjectionStatus = { readonly kind: "disabled" } | (RecordedProjectionStatus & { readonly view?: ProjectionViewStatus });

/** Capability and lazy checkout access; disabled stores resolve no projection dependency. */
export interface ProjectionStatusInput {
  readonly store: Pick<Store, "capabilities">;
  readonly checkout: string;
  readonly location?: ProjectionLocation;
  readonly ports?: () => Pick<ProjectionEnginePorts, "exec" | "fs">;
  readonly view?: () => Promise<ProjectionViewStatus>;
}

/** Read the current index and optional view diagnostics without acquiring a lease or publishing state. */
export async function readProjectionStatus(input: ProjectionStatusInput): Promise<ProjectionStatus> {
  if (!input.store.capabilities.stateOffBranch) return { kind: "disabled" };
  const [recorded, view] = await Promise.all([readRecordedProjectionStatus(input), input.view?.()]);
  return view === undefined ? recorded : { ...recorded, view };
}

async function readRecordedProjectionStatus(input: ProjectionStatusInput): Promise<RecordedProjectionStatus> {
  const location = input.location ?? await locateProjection(input.checkout,
    input.ports?.() ?? createProjectionEnginePorts(input.checkout));
  const read = await readProjectionIndex(location, false, { groups: "walked", retry: true });
  if (read.kind === "no-projection") return read;
  if (read.kind === "unusable") return { ...read, remedy: {
    text: "Restore a readable projection index, then retry; existing projected files have been left alone.",
  } };
  return snapshot(read.index);
}

function snapshot(index: ProjectionIndex): Extract<ProjectionStatus, { kind: "ready" }> {
  const files: ProjectionFileStatus[] = [];
  const copies = new Map<string, ProjectionCopyStatus>();
  for (const path of Object.keys(index.entries).sort()) {
    const entry = index.entries[path];
    if (entry === undefined) continue;
    if (entry.kind === "ownerless") {
      files.push({ path, ownerless: true, pending: false, withheld: entry.withheld === true, refused: entry.refused, unshown: [] });
      continue;
    }
    if (entry.pending || entry.withheld || entry.refused !== null || entry.unshown.length > 0) {
      files.push({ path, ownerless: false, pending: entry.pending, withheld: entry.withheld,
        refused: entry.refused, unshown: entry.unshown });
    }
    for (const copy of entry.copies) copies.set(copy.name, { path, copy: copy.name, withheld: false });
  }
  for (const copy of index.withheldCopies) copies.set(copy, {
    path: copies.get(copy)?.path ?? parseAsideFile(copy)?.path ?? null, copy, withheld: true,
  });
  const tripwires = projectionTripwires(index.tripwires);
  return { kind: "ready", files, copies: [...copies.values()].sort((left, right) => left.copy.localeCompare(right.copy)),
    ...(tripwires.length === 0 ? {} : { tripwires }) };
}

/** Render the recorded conditions, original copy paths, and available repair guidance. */
export function buildProjectionStatusSummary(status: ProjectionStatus): string {
  if (status.kind === "disabled") return "Disabled.";
  const lines = [...(status.view?.diagnostics.flatMap(mark => [mark.reason, `  ${renderRemedy(mark.remedy)}`]) ?? []),
    ...renderRecordedStatus(status)];
  return lines.length === 0 ? "Clean." : lines.join("\n");
}

function renderRecordedStatus(status: RecordedProjectionStatus): string[] {
  if (status.kind === "no-projection") return ["No projection is recorded in this checkout."];
  if (status.kind === "unusable") return [`Projection index is ${status.cause}.`, renderRemedy(status.remedy)];
  const lines = status.files.flatMap(renderFile);
  lines.push(...(status.tripwires ?? []).map(formatProjectionTripwire));
  for (const copy of status.copies) lines.push(`aside copy ${copy.copy}${copy.withheld ? " (withheld)" : ""}`,
    copy.path === null ? "  Original path unavailable." : `  From ${copy.path}`);
  return lines;
}

function renderFile(file: ProjectionFileStatus): string[] {
  const states = [file.ownerless && "ownerless", file.pending && "pending", file.withheld && "withheld",
    file.refused !== null && "refused"].filter(Boolean);
  const lines = [`${file.path}: ${states.length === 0 ? "unshown conflicts" : states.join(", ")}`];
  if (file.refused !== null) lines.push(`  ${file.refused.reason}`, `  ${renderRemedy(file.refused.remedy)}`);
  for (const conflict of file.unshown) lines.push(`  unshown conflict: ${formatConflictToken(conflict)}`);
  return lines;
}

function renderRemedy(remedy: Remedy): string {
  return remedy.argv === undefined ? remedy.text : `${remedy.text} \`${remedy.argv.map(renderRemedyArgument).join(" ")}\``;
}
