/** Publish a header over immutable root partitions; the header is the index's sole commit point. */
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { atomicWriteFile } from "../../fs.js";
import { PROJECTION_INDEX_FORMAT, type ProjectionIndex } from "./index-schema.js";
import { readReference, smudgeRacyEntries, writeReference } from "./change-detection.js";
import { gitBlobId } from "./blob-id.js";
import {
  loadProjectionGroups, parseProjectionJson, partitionedProjectionEntries, projectionIndexBacking, projectionIndexGroup,
  ProjectionPartitionMismatch, stringifyProjectionJson, type ProjectionEntries, type ProjectionGroup,
} from "./index-memory.js";
import type { ProjectionLocation } from "./location.js";

/** The header's file name in the state folder. */
export const PROJECTION_INDEX_FILE = "index";
/** Persisted header, which deliberately contains no entries. */
export type ProjectionIndexHeader = Omit<ProjectionIndex, "entries"> & { groups: Record<string, ProjectionGroup> };

/** Write changed partitions followed by their header, without creating the containing folder. */
export async function writeProjectionIndex(location: ProjectionLocation, index: ProjectionIndex, checkpoint?: () => Promise<void>,
  reference: bigint | null = null): Promise<void> {
  const published = await publish(location, index, reference, checkpoint);
  await collectPartitions(location, published.groups, checkpoint);
}

/** Publish value-changed partitions, smudge only those, advance the reference, then collect old partitions. */
export async function commitProjectionIndex(input: {
  location: ProjectionLocation; checkout: string; index: ProjectionIndex; checkpoint?: () => Promise<void>;
}): Promise<ProjectionIndex> {
  const reference = await readReference(input.checkout);
  const published = await publish(input.location, input.index, reference, input.checkpoint);
  await writeReference(input.checkout, input.checkpoint);
  await collectPartitions(input.location, published.groups, input.checkpoint);
  return { ...input.index, ignoreFiles: published.header.ignoreFiles, entries: partitionedProjectionEntries({ location: input.location,
    groups: published.groups, loaded: published.loaded, sources: published.sources }) };
}

async function publish(location: ProjectionLocation, index: ProjectionIndex, reference: bigint | null,
  checkpoint?: () => Promise<void>) {
  const backing = projectionIndexBacking(index);
  const groups = { ...backing?.groups }, loaded = new Map(backing?.loaded), sources = new Map(backing?.sources);
  const present = new Set(await readdir(location.stateDir));
  if (backing === undefined) groupPlainEntries(index.entries, loaded);
  for (const [group, entries] of loaded) {
    const previous = groups[group];
    if (previous !== undefined && present.has(previous.name) && isDeepStrictEqual(entries, sources.get(group)?.entries)) continue;
    if (Object.keys(entries).length === 0) { Reflect.deleteProperty(groups, group); sources.delete(group); continue; }
    const written = smudgeRacyEntries({ ...index, entries }, reference).entries;
    const bytes = stringifyProjectionJson(written), name = `index-${gitBlobId(bytes, "sha1")}`;
    await writePartition(location, name, bytes, checkpoint);
    groups[group] = { name, unsettled: Object.values(written).some(unsettled) };
    loaded.set(group, written); sources.set(group, { entries: written });
  }
  const header: ProjectionIndexHeader = { format: index.format, state: index.state, projectedUnder: index.projectedUnder,
    ...(index.reprojectionPending === undefined ? {} : { reprojectionPending: index.reprojectionPending }),
    withheldCopies: index.withheldCopies, tripwires: index.tripwires, ignoreFiles: index.ignoreFiles, ignoreGuard: index.ignoreGuard, groups };
  header.ignoreFiles = smudgeRacyEntries({ ...index, entries: {} }, reference).ignoreFiles;
  await atomicWriteFile(join(location.stateDir, PROJECTION_INDEX_FILE), stringifyProjectionJson(header), { createParents: false, checkpoint });
  return { header, groups, loaded, sources };
}

function groupPlainEntries(entries: ProjectionEntries, groups: Map<string, ProjectionEntries>): void {
  for (const [path, entry] of Object.entries(entries)) {
    const group = projectionIndexGroup(path), held = groups.get(group) ?? {};
    held[path] = entry; groups.set(group, held);
  }
}

async function writePartition(location: ProjectionLocation, name: string, bytes: string, checkpoint?: () => Promise<void>): Promise<void> {
  try { if (await readFile(join(location.stateDir, name), "utf8") === bytes) return; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await atomicWriteFile(join(location.stateDir, name), bytes, { createParents: false, checkpoint });
}

function unsettled(entry: ProjectionEntries[string]): boolean {
  return entry.kind === "ownerless" || entry.copies.length > 0 || entry.persisted?.takenIn.kind === "copy"
    || entry.adoption !== undefined || entry.pending || entry.withheld || entry.refused !== null || entry.unshown.length > 0;
}

async function collectPartitions(location: ProjectionLocation, groups: Record<string, ProjectionGroup>, checkpoint?: () => Promise<void>): Promise<void> {
  const named = new Set(Object.values(groups).map(group => group.name));
  for (const name of await readdir(location.stateDir)) {
    if (!/^index-[a-f0-9]{40}$/u.test(name) || named.has(name)) continue;
    await checkpoint?.();
    // A held file can wait for a later publication; losing the lease cannot.
    await rm(join(location.stateDir, name)).catch(() => undefined);
  }
}

/** Why an index a checkout should hold cannot be used. */
export type UnusableIndexCause = "missing" | "unreadable" | "other-format";
/** Index authority, its intentional absence, or why it cannot be used. */
export type ProjectionIndexRead =
  | { readonly kind: "index"; readonly index: ProjectionIndex }
  | { readonly kind: "no-projection" }
  | { readonly kind: "unusable"; readonly cause: UnusableIndexCause; readonly header?: ProjectionIndexHeader };
/** Explicit initial groups, with one whole-read retry for readers that hold no lease. */
export interface ProjectionIndexReadOptions {
  readonly groups?: Parameters<typeof loadProjectionGroups>[1];
  readonly retry?: boolean;
}

/** Read the header and partition presence, loading only the caller's selected groups. */
export async function readProjectionIndex(location: ProjectionLocation, holdsProjection: boolean,
  options: ProjectionIndexReadOptions = {}): Promise<ProjectionIndexRead> {
  const path = join(location.stateDir, PROJECTION_INDEX_FILE);
  for (let attempt = 0; attempt < 2; attempt++) {
    const read = await readHeaderText(path, holdsProjection);
    if (read.kind !== "text") return read;
    const decoded = decodeHeader(read.text);
    if (decoded.kind !== "header") return decoded;
    try { return await readPartitions(location, decoded.header, options); }
    catch (error) {
      if (!(error instanceof ProjectionPartitionMismatch)) return { kind: "unusable", cause: "unreadable", header: decoded.header };
      if (options.retry && attempt === 0 && await readFile(path, "utf8").catch(() => null) !== read.text) continue;
      return { kind: "unusable", cause: "unreadable", header: decoded.header };
    }
  }
  return { kind: "unusable", cause: "unreadable" };
}

type AbsentIndex = Exclude<ProjectionIndexRead, { kind: "index" }>;
async function readHeaderText(path: string, holdsProjection: boolean): Promise<{ kind: "text"; text: string } | AbsentIndex> {
  try { return { kind: "text", text: await readFile(path, "utf8") }; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return holdsProjection ? { kind: "unusable", cause: "missing" } : { kind: "no-projection" };
    return { kind: "unusable", cause: "unreadable" };
  }
}

async function readPartitions(location: ProjectionLocation, header: ProjectionIndexHeader, options: ProjectionIndexReadOptions): Promise<ProjectionIndexRead> {
  const names = new Set(await readdir(location.stateDir));
  for (const group of Object.values(header.groups)) {
    if (!names.has(group.name)) throw new ProjectionPartitionMismatch(group.name, location);
  }
  const { groups, ...fields } = header;
  const index: ProjectionIndex = { ...fields, entries: partitionedProjectionEntries({ location, groups,
    loaded: new Map(), sources: new Map() }) };
  if (options.groups !== undefined) loadProjectionGroups(index, options.groups);
  return { kind: "index", index };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeHeader(text: string): { kind: "header"; header: ProjectionIndexHeader } | Exclude<AbsentIndex, { kind: "no-projection" }> {
  try {
    const header = parseProjectionJson(text);
    if (!object(header)) throw new Error("Invalid header");
    if (typeof header.format === "number" && header.format !== PROJECTION_INDEX_FORMAT) return { kind: "unusable", cause: "other-format" };
    if (!headerFields(header) || !object(header.groups) || !Object.entries(header.groups).every(validGroup)) throw new Error("Invalid header");
    return { kind: "header", header: header as ProjectionIndexHeader };
  } catch { return { kind: "unusable", cause: "unreadable" }; }
}

function headerFields(header: Record<string, unknown>): boolean {
  return header.format === PROJECTION_INDEX_FORMAT && object(header.projectedUnder) && Array.isArray(header.withheldCopies)
    && object(header.tripwires) && (header.ignoreFiles === null || Array.isArray(header.ignoreFiles))
    && (header.ignoreGuard === null || object(header.ignoreGuard));
}

function validGroup([group, descriptor]: [string, unknown]): boolean {
  return /^\.arc\/(?:active|backlog|completed(?:\/[^/.][^/]*)?|user\/[a-z0-9-]+)$/u.test(group)
    && object(descriptor) && typeof descriptor.name === "string" && /^index-[a-f0-9]{40}$/u.test(descriptor.name)
    && typeof descriptor.unsettled === "boolean";
}
