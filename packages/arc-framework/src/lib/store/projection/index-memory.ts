/** Lazy, copy-on-write entry groups behind the index's synchronous path lookup surface. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gitBlobId } from "./blob-id.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionLocation } from "./location.js";

/** Entries stored in one root partition. */
export type ProjectionEntries = ProjectionIndex["entries"];
/** A header's immutable reference to one content-addressed root partition. */
export interface ProjectionGroup { readonly name: string; readonly unsettled: boolean }
/** Persisted groups and this index version's own logical loading state. */
export interface ProjectionIndexBacking {
  readonly location: ProjectionLocation;
  readonly groups: Readonly<Record<string, ProjectionGroup>>;
  readonly loaded: Map<string, ProjectionEntries>;
  readonly sources: Map<string, { entries: ProjectionEntries }>;
}
const backings = new WeakMap<object, ProjectionIndexBacking>();

/** A named partition was missing, unreadable, malformed, or no longer matched its content address. */
export class ProjectionPartitionMismatch extends Error {
  constructor(readonly partition: string, readonly location: ProjectionLocation) {
    super(`Projection partition ${partition} is unreadable or does not match its name.`);
    this.name = "ProjectionPartitionMismatch";
  }
}

/** Select the fixed partition containing a projected path. */
export function projectionIndexGroup(path: string): string {
  const parts = path.split("/");
  if (parts[1] === "user" || parts[1] === "completed" && parts.length > 3) return parts.slice(0, 3).join("/");
  return parts.slice(0, 2).join("/");
}

/** Plain JSON with only filesystem stat fields restored to bigint. */
export function parseProjectionJson(bytes: string): unknown {
  return JSON.parse(bytes, (key, value: unknown) =>
    (key === "size" || key === "mtimeNs" || key === "ino") && typeof value === "string" ? BigInt(value) : value);
}

/** Serialize native bigint stats without running a schema on the hot path. */
export function stringifyProjectionJson(value: unknown): string {
  return `${JSON.stringify(value, (_key, field: unknown) => typeof field === "bigint" ? field.toString() : field)}\n`;
}

/** Read source metadata without forcing an unloaded partition. */
export function projectionIndexBacking(index: ProjectionIndex): ProjectionIndexBacking | undefined {
  return backings.get(index.entries);
}

/** Expose synchronous path lookup while enumeration includes only explicitly loaded groups. */
export function partitionedProjectionEntries(backing: ProjectionIndexBacking): ProjectionEntries {
  const entries = new Proxy<ProjectionEntries>(Object.create(null) as ProjectionEntries, {
    get: (_target, path) => typeof path === "string" ? loadGroup(backing, projectionIndexGroup(path))[path] : undefined,
    has: (_target, path) => typeof path === "string" && Object.hasOwn(loadGroup(backing, projectionIndexGroup(path)), path),
    ownKeys: () => [...backing.loaded.values()].flatMap(group => Object.keys(group)),
    getOwnPropertyDescriptor: (_target, path) => {
      if (typeof path !== "string") return undefined;
      const group = loadGroup(backing, projectionIndexGroup(path));
      return Object.hasOwn(group, path) ? { enumerable: true, configurable: true, value: group[path] } : undefined;
    },
  });
  backings.set(entries, backing);
  return entries;
}

function loadGroup(backing: ProjectionIndexBacking, group: string): ProjectionEntries {
  const loaded = backing.loaded.get(group);
  if (loaded !== undefined) return loaded;
  const descriptor = backing.groups[group];
  if (descriptor === undefined) return {};
  let source = backing.sources.get(group);
  if (source === undefined) {
    try {
      const bytes = readFileSync(join(backing.location.stateDir, descriptor.name), "utf8");
      if (`index-${gitBlobId(bytes, "sha1")}` !== descriptor.name) throw new Error("Content address differs");
      const parsed = parseProjectionJson(bytes);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
        || Object.keys(parsed).some(path => projectionIndexGroup(path) !== group)) throw new Error("Invalid root partition");
      source = { entries: parsed as ProjectionEntries };
      backing.sources.set(group, source);
    } catch { throw new ProjectionPartitionMismatch(descriptor.name, backing.location); }
  }
  backing.loaded.set(group, source.entries);
  return source.entries;
}

/** Load named roots, all roots, or the ordinary walk plus every unsettled root before enumeration. */
export function loadProjectionGroups(index: ProjectionIndex, selection: "all" | "non-completed" | "walked" | readonly string[]): void {
  const backing = projectionIndexBacking(index);
  if (backing === undefined) return;
  const roots = typeof selection !== "string" ? selection : Object.keys(backing.groups).filter(group =>
    selection === "all" || selection === "non-completed" && !group.startsWith(".arc/completed")
    || selection === "walked" && (group === ".arc/active" || group === ".arc/backlog"
      || group === `.arc/user/${index.projectedUnder.identity}` || backing.groups[group]?.unsettled));
  for (const group of roots) loadGroup(backing, group);
}

/** Load the owning group for a caller whose interface intentionally exposes only entries. */
export function loadProjectionPathGroup(entries: object, path: string): void {
  const backing = backings.get(entries);
  if (backing !== undefined) loadGroup(backing, projectionIndexGroup(path));
}

/** Update or delete one path without dropping, loading, or copying other root partitions. */
export function withProjectionEntry(index: ProjectionIndex, path: string, entry: ProjectionEntries[string] | undefined): ProjectionIndex {
  const backing = projectionIndexBacking(index);
  if (backing === undefined) {
    const entries = { ...index.entries };
    if (entry === undefined) Reflect.deleteProperty(entries, path); else entries[path] = entry;
    return { ...index, entries };
  }
  const group = projectionIndexGroup(path);
  const next: ProjectionIndexBacking = { ...backing, loaded: new Map(backing.loaded) };
  const entries = { ...loadGroup(next, group) };
  if (entry === undefined) Reflect.deleteProperty(entries, path); else entries[path] = entry;
  next.loaded.set(group, entries);
  return { ...index, entries: partitionedProjectionEntries(next) };
}

/** Replace the entries already enumerated by a pass while retaining every unvisited root. */
export function replaceLoadedProjectionEntries(index: ProjectionIndex, entries: ProjectionEntries): ProjectionIndex {
  const backing = projectionIndexBacking(index);
  if (backing === undefined) return { ...index, entries };
  const next: ProjectionIndexBacking = { ...backing, loaded: new Map([...backing.loaded.keys()].map(group => [group, {}])) };
  for (const [path, entry] of Object.entries(entries)) {
    const group = projectionIndexGroup(path);
    const held = next.loaded.get(group) ?? {};
    held[path] = entry;
    next.loaded.set(group, held);
  }
  return { ...index, entries: partitionedProjectionEntries(next) };
}
