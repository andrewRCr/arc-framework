/** Immutable lifecycle filesystem projection over the public storage contract. */
import { isAbsolute, relative, resolve, sep } from "node:path";
import { ArcError } from "../kernel/errors.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import { identifyWorkUnitArtifactPath, resolveArcPath, type WorkUnitArtifactKind, type WorkUnitPlacement } from "../layout/index.js";
import type { ProjectViewFs, ProjectViewDirEntry } from "../status/project-view.js";
import type { Store } from "./contract.js";
import { RecordReferenceSchema, type StateVersion } from "./identity.js";
import { listLifecycleIndex, type LifecycleEntry, type LifecycleIndexOutcome } from "./lifecycle-index.js";
import type { StoreResult } from "./refusal.js";

/** One lifecycle version and its record-backed filesystem projection. */
export interface StoreLifecycleSnapshot { version: StateVersion; fs: ProjectViewFs }
/** Lifecycle storage accepted structurally by checkpoint and merge composition. */
export interface StoreLifecycleStorage { readSnapshot(): Promise<StoreLifecycleSnapshot> }
/** Bind lifecycle snapshots to a logical store without observing it during construction.
 * @param input - Contract and checkout root used to interpret incoming paths.
 * @returns Snapshot storage whose reads remain bound to one immutable state version.
 */
export function createStoreLifecycleStorage(input: { store: Store; checkoutRoot: string }): StoreLifecycleStorage {
  return { readSnapshot: async () => {
    const version = unwrap(await input.store.version());
    const listing = unwrap(await listLifecycleIndex(input.store, { asOf: version }));
    requireCompleteInventory(input.store, listing);
    const entries = listing.status === "complete" ? listing.index.entries() : [];
    return { version, fs: snapshotFs(input, version, entries) };
  } };
}
function requireCompleteInventory(store: Store, listing: LifecycleIndexOutcome): void {
  if (listing.status === "unreadable") throw new ArcError(`${listing.condition} ${listing.remedy.text}`, "store.lifecycle-unreadable");
  if (listing.status !== "complete" || (!listing.missed && listing.diagnostics.length === 0)) return;
  const diagnostics = listing.diagnostics.filter((item) => store.capabilities.stateOffBranch
    || item.kind !== "malformed" || item.rule !== "placement");
  // A missed signal without any diagnostic has no established omission basis.
  if (diagnostics.length === 0 && listing.diagnostics.length > 0) return;
  const evidence = diagnostics.map((item) => `${item.condition} ${item.remedy.text}`).join("; ")
    || "Lifecycle inventory reports missed records. Repair the missed lifecycle records, then retry the snapshot.";
  throw new ArcError(evidence, "store.lifecycle-incomplete", { cause: diagnostics });
}
function unwrap<T>(value: StoreResult<T>): T {
  if (value.status === "ok") return value.result;
  throw new ArcError(`${value.refusal.condition} ${value.refusal.remedy.text}`, "store.lifecycle-refused", { cause: value.refusal });
}
function missing(path: string): Error {
  return Object.assign(new Error(`Lifecycle record path is absent: ${path}`), { code: "ENOENT" });
}
function repositoryPath(root: string, path: string): string {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
  return relative(resolve(root), absolute).split(sep).join("/");
}
function placementOf(entry: LifecycleEntry): WorkUnitPlacement {
  const value = entry.placement;
  if (value.kind === "active") return { kind: "active", scope: { kind: "project" } };
  if (value.kind === "backlog") return { ...value, cohort: (entry.fields.cohort ?? "").split("/").filter(Boolean).map((part) => SlugSchema.parse(part)) };
  if (!("sequence" in value)) throw new ArcError("A completed work-unit record has no archive sequence", "store.lifecycle-placement");
  return { kind: "completed", quarter: value.quarter, sequence: value.sequence };
}
function artifactPath(entry: LifecycleEntry, artifact: WorkUnitArtifactKind): string {
  return resolveArcPath({ kind: "work-unit-artifact", artifact, slug: entry.reference.owner.name, placement: placementOf(entry) });
}
const artifactKinds = { meta: "work-item/meta", draft: "work-item/draft", spec: "work-item/spec", tasks: "work-item/task-list", notes: "work-item/notes" } as const;
function snapshotFs(input: { store: Store; checkoutRoot: string }, version: StateVersion, entries: readonly LifecycleEntry[]): ProjectViewFs {
  const bySlug = new Map(entries.map((entry) => [entry.reference.owner.name, entry]));
  const directories = projectedDirectories(entries.map((entry) => artifactPath(entry, "meta")));
  return {
    readdir: (path) => {
      const directory = directories.get(repositoryPath(input.checkoutRoot, path));
      if (directory === undefined) return Promise.reject(missing(path));
      return Promise.resolve([...directory.values()].sort((left, right) => left.name.localeCompare(right.name)));
    },
    readFile: async (path) => {
      const projected = repositoryPath(input.checkoutRoot, path);
      const identified = identifyWorkUnitArtifactPath(projected);
      const entry = identified === null ? undefined : bySlug.get(identified.slug);
      if (identified === null || entry === undefined || artifactPath(entry, identified.artifact) !== projected) throw missing(path);
      const reference = RecordReferenceSchema.parse({ kind: artifactKinds[identified.artifact], owner: entry.reference.owner });
      const read = await input.store.read({ reference, asOf: version });
      if (read.status === "refused" && read.refusal.code === "not-found") throw missing(path);
      // The existing lifecycle tree reader exposes GitExec's trimmed stdout to its consumers.
      return unwrap(read).content.trimEnd();
    },
  };
}
function projectedDirectories(paths: string[]): Map<string, Map<string, ProjectViewDirEntry>> {
  const directories = new Map<string, Map<string, ProjectViewDirEntry>>();
  for (const path of paths) {
    const segments = path.split("/");
    let parent = "";
    for (const [index, name] of segments.entries()) {
      const isFile = index === segments.length - 1;
      const directory = directories.get(parent) ?? new Map<string, ProjectViewDirEntry>();
      directory.set(name, { name, isFile: () => isFile, isDirectory: () => !isFile });
      directories.set(parent, directory);
      parent = parent === "" ? name : `${parent}/${name}`;
    }
  }
  return directories;
}
