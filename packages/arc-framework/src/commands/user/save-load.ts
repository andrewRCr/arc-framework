import { rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";

import {
  deserialize,
  filterCommitsReachableFromHead,
  getCurrentBranch,
  isSafeManifestPath,
  reduceCommitsToCausallyMaximal,
  serialize,
  shortHash,
  type SerializeResult,
  type SkipWarning,
  type SyncManifest,
} from "../../lib/git/index.js";
import { runWorktreeRoster } from "../../lib/git/worktree-roster.js";
import { ensureDir } from "../../lib/template/index.js";
import {
  acquireAdvisoryLock,
  appendRemovalTombstonesFromEntries,
  classifyOrphans,
  classifyUserSyncPath,
  getNotesLockPath,
  getUserInternalDir,
  releaseAdvisoryLock,
  mergeCrossWuFile,
  NO_COMPARABLE_SOURCE_COMMIT,
  planRetiredSubdirReconcile,
  projectManifest,
  readMaterializedBaselineStamp,
  writeMaterializedBaselineStamp,
  resolveCurrentWuName,
  stashedFilesInSubdir,
  subdirsFromPaths,
  readLocalSyncState,
  writeLocalSyncState,
  wuNameOfPath,
  type LocalSyncState,
  type MaterializedBaselineEntry,
  type MergeNote,
  type OrphanClassification,
} from "../../lib/user-sync/index.js";
import { resolveUserSurfaceResolver, type UserSurfaceResolver } from "../../lib/user-surfaces.js";
import { readShippedWorkUnitsFromRef } from "../../lib/work-unit/completed-index.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import {
  listAnnotatedNoteCommits,
  readNoteContentAtAnnotatedCommit,
  readRecentUserNotes,
  type RecentNote,
} from "../../lib/user-sync/notes-ref.js";
import { removeStaleUserWuSubdir } from "./open.js";
import { notesRef } from "./shared.js";
import {
  BACKUP_FILENAME,
  UserLoadVerificationError,
  UserSaveError,
  UserSaveVerificationError,
  type UserLoadOutcome,
  type NearestNoteSearch,
  type UserIOContext,
  type UserLoadOptions,
  type UserSaveOptions,
  type UserSaveResult,
  type LoadMessage,
} from "./types.js";

const BACKUP_TIMESTAMPED_PREFIX = ".pre-load-backup-";
const BACKUP_TIMESTAMPED_SUFFIX = ".json";
const BACKUP_RETENTION = 3;
// A bare root-level `SESSION-NOTES.md` predates per-WU note subdirs and belongs to no
// work unit. It is never materialized (nor re-saved), so it is excluded from the
// identity-global surface and dropped from a loaded manifest by the current-WU filter.
const LEGACY_ROOT_SESSION_NOTES = "SESSION-NOTES.md";

type ResolutionPointer = Pick<LocalSyncState, "sourceCommit" | "sourceOperation">;

interface NearestUserNoteResolutionInput {
  io: UserIOContext;
  identity: string;
  currentWuName?: string;
  localSyncState: ResolutionPointer | null;
}

interface ReachableNoteCandidate {
  commit: string;
  content?: string;
}

export interface LoadManifestSnapshot {
  search: NearestNoteSearch;
  manifest: SyncManifest | null;
  sourceCommit: string;
  fromAncestor: boolean;
  mergeWarnings: string[];
}

/**
 * Save the user directory to user notes on HEAD.
 *
 * Serializes eligible files from `user/{identity}/` and stores the JSON
 * manifest as a git note on the current HEAD commit.
 *
 * @param options - Save options
 * @returns Save result with file count and warnings
 */
export async function runUserSave(
  options: UserSaveOptions,
): Promise<UserSaveResult> {
  const { cwd, io, identity } = options;
  const currentWuName = options.currentWuName ?? await resolveCurrentWuName(cwd, io.exec);

  // `git notes add` does its own unguarded read-modify-write on the notes tree,
  // so two same-identity saves racing this span silently collapse to one note;
  // the tombstone basis is also a repo-shared disk snapshot. Serialize the HEAD
  // resolution, disk read, tombstone apply, write, verification, and baseline
  // stamp together so every diff input belongs to the same locked view.
  let commit!: string;
  let result!: SerializeResult;
  let savedNotesRefTip!: string | null;
  const lock = await acquireAdvisoryLock(await getNotesLockPath(io.exec, cwd, identity));
  try {
    const head = await io.exec("git", ["rev-parse", "HEAD"]);
    commit = head.stdout.trim();
    result = await serializeSplitUserManifest({
      cwd,
      io,
      identity,
      currentWuName,
    });

    if (Object.keys(result.manifest.files).length === 0) {
      throw new UserSaveError("No eligible files found in user directory to save.");
    }

    const baseline = await readMaterializedBaselineStamp(io.exec, cwd, identity);
    if (baseline !== null) {
      applyRemovalTombstones(result.manifest, baseline.entries, new Date().toISOString());
    }

    const json = JSON.stringify(result.manifest);
    await io.writeNote(notesRef(identity), json, commit);
    await verifySavedNote(io, identity, commit, result.manifest);
    const projectedSave = projectManifest(result.manifest);
    savedNotesRefTip = await readNotesRefTip(io, identity);
    await writeMaterializedBaselineStamp({
      exec: io.exec,
      cwd,
      identity,
      manifest: projectedSave,
      manifestHash: hashSyncManifest(projectedSave),
      notesRefTip: savedNotesRefTip,
    });
  } finally {
    await releaseAdvisoryLock(lock);
  }
  const projectedSave = projectManifest(result.manifest);
  await writeLocalSyncState(
    cwd,
    io,
    identity,
    hashSyncManifest(projectedSave),
    commit,
    "save",
    commit,
    Object.keys(projectedSave.files),
    savedNotesRefTip,
  );

  return {
    identity,
    commit: await shortHash(io.exec, commit),
    fileCount: Object.keys(result.manifest.files).length,
    warnings: result.warnings,
  };
}

/**
 * Load the user directory from user notes.
 *
 * Resolves the per-WU note by annotated-commit ancestry, then merges recent
 * cross-WU flat-file entries so new WUs can still load shared context.
 *
 * @param options - Load options
 * @returns Load result, or null if no note found
 */
export async function runUserLoad(
  options: UserLoadOptions,
): Promise<UserLoadOutcome | null> {
  const { cwd, io, identity } = options;
  const currentWuName = options.currentWuName ?? await resolveCurrentWuName(cwd, io.exec);
  const resolver = await resolveUserSurfaceResolver({ cwd, identity, exec: io.exec });
  const snapshot = await buildUserLoadManifestSnapshot({
    cwd,
    io,
    identity,
    currentWuName,
  });

  if (snapshot.manifest === null) {
    return null;
  }
  const loadManifest = snapshot.manifest;

  let notices: LoadMessage[] = [];
  const cleanups: LoadMessage[] = [];
  try {
    const localResult = await serializeSplitUserManifest({
      cwd,
      io,
      identity,
      currentWuName,
      resolver,
    });
    const localFiles = localResult.manifest.files;
    const activeUserDir = join(cwd, ".arc", "user", identity);
    const activeLocalFiles = (await serialize(activeUserDir, io.readDir, io.readFile)).manifest.files;
    const reconcile = await resolveReconcilableSubdirs({ cwd, io, localFiles: activeLocalFiles });
    const reconciledFileBackup = filesInSubdirs(activeLocalFiles, new Set(reconcile));
    const backupManifest = buildBackupManifest(localFiles, reconciledFileBackup);

    let backupFilename: string | null = null;
    if (Object.keys(backupManifest.files).length > 0) {
      backupFilename = await writeTimestampedBackup(
        join(resolver.identityGlobalRoot, ".internal"),
        io,
        backupManifest,
      );
    }

    const reconciled = await removeReconciledSubdirs({ cwd, identity, reconcile });
    const backupForNotice = backupFilename ?? createTimestampedBackupFilename();

    notices = [
      ...classifyOrphans({
        localFiles: { ...localFiles, ...reconciledFileBackup },
        manifestFiles: loadManifest.files,
        reconciledSubdirs: reconciled,
        currentWuName,
      }).map((classification) => ({
        level: "notice" as const,
        text: renderOrphanNotice(classification, backupForNotice),
      })),
    ];

    // Tier the removal announcement by content: a subdir holding only ARC's
    // own SESSION-NOTES is a routine cleanup; one the operator stashed extra
    // files in earns a louder notice naming them and the recoverable backup.
    for (const subdir of reconciled) {
      const stashed = stashedFilesInSubdir(Object.keys(activeLocalFiles), subdir);
      if (stashed.length === 0) {
        cleanups.push({
          level: "cleanup",
          text: `Retired WU subdir "${subdir}" (shipped) — removed; backed up to .internal/${backupForNotice}`,
        });
      } else {
        notices.push({
          level: "notice",
          text:
            `Retired WU subdir "${subdir}" (shipped) — removed; it held file(s) you added ` +
            `(${stashed.join(", ")}); recover from .internal/${backupForNotice} if you still need them`,
        });
      }
    }
  } catch (err) {
    // The active user dir may not exist yet (fresh identity / no prior notes);
    // that ENOENT is the expected skip. Any other failure is real — surface it
    // rather than silently swallowing a backup or subdir-removal error.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  let projectedLoad!: SyncManifest;
  let loadedNotesRefTip!: string | null;
  const materializeLock = await acquireAdvisoryLock(await getNotesLockPath(io.exec, cwd, identity));
  try {
    await deserializeSplitUserManifest({
      cwd,
      io,
      identity,
      currentWuName,
      resolver,
    }, loadManifest);
    await verifyMaterializedSplitUserManifest({
      cwd,
      io,
      identity,
      currentWuName,
      resolver,
    }, snapshot.sourceCommit, loadManifest);
    projectedLoad = projectManifest(loadManifest);
    loadedNotesRefTip = await readNotesRefTip(io, identity);
    await writeMaterializedBaselineStamp({
      exec: io.exec,
      cwd,
      identity,
      manifest: projectedLoad,
      manifestHash: hashSyncManifest(projectedLoad),
      notesRefTip: loadedNotesRefTip,
    });
  } finally {
    await releaseAdvisoryLock(materializeLock);
  }
  await writeLocalSyncState(
    cwd,
    io,
    identity,
    hashSyncManifest(projectedLoad),
    snapshot.sourceCommit,
    "load",
    snapshot.sourceCommit,
    Object.keys(projectedLoad.files),
    loadedNotesRefTip,
  );

  return {
    kind: "loaded",
    identity,
    commit: await formatLoadSourceCommit(io, snapshot.sourceCommit),
    fileCount: Object.keys(loadManifest.files).length,
    fromAncestor: snapshot.fromAncestor,
    ancestorDistance: snapshot.search.note?.ancestorDistance ?? 0,
    // A cross-WU-only load (no per-WU note resolved — e.g. a brand-new WU loading
    // shared context before its first save) has no annotated commit to be off-
    // ancestry, so leave `reachableFromHead` undefined rather than defaulting it
    // false and firing the off-ancestry summary line spuriously.
    reachableFromHead: snapshot.search.note?.reachableFromHead,
    currentBranch: snapshot.search.note?.reachableFromHead === false ? await getCurrentBranch(io.exec) : null,
    messages: [
      ...cleanups,
      ...notices,
      ...snapshot.mergeWarnings.map((text): LoadMessage => ({ level: "warning", text })),
    ],
  };
}

/**
 * Serialize the logical user-sync manifest from semantic storage roots.
 *
 * Identity-global flat files come from the canonical root, while the current
 * WU's SESSION-NOTES tree comes from the active worktree. The returned manifest
 * is the single logical basis saved to notes, compared by status, and captured
 * in pre-load backups.
 *
 * @param options - User command options plus optional resolved WU/resolver
 * @returns Logical manifest and serialization warnings
 */
export async function serializeSplitUserManifest(options: {
  cwd: string;
  io: UserIOContext;
  identity: string;
  currentWuName?: string;
  resolver?: UserSurfaceResolver;
}): Promise<SerializeResult> {
  const { cwd, io, identity, currentWuName } = options;
  const resolver = options.resolver
    ?? await resolveUserSurfaceResolver({ cwd, identity, exec: io.exec });
  const identityResult = await serializeIdentityGlobalRoot(resolver, io);
  const files: Record<string, string> = { ...identityResult.manifest.files };
  const warnings: SkipWarning[] = [...identityResult.warnings];

  if (currentWuName !== undefined) {
    const workUnitResult = await serialize(resolver.workUnitRoot(currentWuName), io.readDir, io.readFile);
    Object.assign(files, prefixManifestFiles(workUnitResult.manifest.files, currentWuName));
    warnings.push(...workUnitResult.warnings.map((warning) => ({
      ...warning,
      path: `${currentWuName}/${warning.path}`,
    })));
  }

  return { manifest: { version: 2, files }, warnings };
}

/**
 * Build the logical manifest a load/status operation should compare or
 * materialize, without writing files.
 *
 * @param options - Load options, including the already-resolved current WU
 * @returns Snapshot of the selected note, logical manifest, and merge warnings
 */
export async function buildUserLoadManifestSnapshot(
  options: UserLoadOptions,
): Promise<LoadManifestSnapshot> {
  const { io, identity } = options;
  const search = await findNearestUserNote(options);
  const recentNotes = await readRecentUserNotes(io.exec, identity);
  const { files: crossWuFiles, warnings: mergeWarnings } = mergeCrossWuFromNotes(recentNotes);

  if (!search.note && Object.keys(crossWuFiles).length === 0) {
    return {
      search,
      manifest: null,
      sourceCommit: NO_COMPARABLE_SOURCE_COMMIT,
      fromAncestor: false,
      mergeWarnings,
    };
  }

  let version: SyncManifest["version"] = 2;
  let sourceCommit = NO_COMPARABLE_SOURCE_COMMIT;
  let fromAncestor = false;
  const perWuFiles: Record<string, string> = {};

  if (search.note) {
    const manifest = await parseResolvedNoteManifest(search.note.content, search.note.commit, io);
    version = manifest.version;
    sourceCommit = search.note.commit;
    fromAncestor = search.note.fromAncestor;
    const filtered = filterManifestForWu(manifest, options.currentWuName);
    for (const [path, content] of Object.entries(filtered.files)) {
      if (!isIdentityGlobalManifestPath(path)) perWuFiles[path] = content;
    }
  }

  return {
    search,
    manifest: { version, files: { ...perWuFiles, ...crossWuFiles } },
    sourceCommit,
    fromAncestor,
    mergeWarnings,
  };
}

async function serializeIdentityGlobalRoot(
  resolver: UserSurfaceResolver,
  io: UserIOContext,
): Promise<SerializeResult> {
  return serialize(
    resolver.identityGlobalRoot,
    async (dirPath) => (await io.readDir(dirPath))
      .filter((entry) => isIdentityGlobalManifestPath(entry.name)),
    io.readFile,
  );
}

function isIdentityGlobalManifestPath(path: string): boolean {
  return classifyUserSyncPath(path) === "cross-wu" && path !== LEGACY_ROOT_SESSION_NOTES;
}

function prefixManifestFiles(
  files: Record<string, string>,
  prefix: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([path, content]) => [`${prefix}/${path}`, content]),
  );
}

async function deserializeSplitUserManifest(
  options: {
    cwd: string;
    io: UserIOContext;
    identity: string;
    currentWuName?: string;
    resolver: UserSurfaceResolver;
  },
  manifest: SyncManifest,
): Promise<void> {
  const identityGlobalFiles: Record<string, string> = {};
  const workUnitFiles: Record<string, string> = {};
  const currentWuName = options.currentWuName;

  for (const [path, content] of Object.entries(manifest.files)) {
    if (isIdentityGlobalManifestPath(path)) {
      identityGlobalFiles[path] = content;
      continue;
    }
    if (currentWuName === undefined) continue;
    const prefix = `${currentWuName}/`;
    if (path.startsWith(prefix)) {
      workUnitFiles[path.slice(prefix.length)] = content;
    }
  }

  if (Object.keys(identityGlobalFiles).length > 0) {
    await ensureDir(options.resolver.identityGlobalRoot, options.io.mkdir);
    await deserialize(
      options.resolver.identityGlobalRoot,
      { version: manifest.version, files: identityGlobalFiles },
      options.io.writeFile,
      options.io.mkdir,
    );
  }

  if (currentWuName !== undefined && Object.keys(workUnitFiles).length > 0) {
    const workUnitRoot = options.resolver.workUnitRoot(currentWuName);
    await ensureDir(workUnitRoot, options.io.mkdir);
    await deserialize(
      workUnitRoot,
      { version: manifest.version, files: workUnitFiles },
      options.io.writeFile,
      options.io.mkdir,
    );
  }
}

/**
 * Parse and validate a resolved note's serialized manifest, throwing a
 * diagnostic on corrupt JSON or an unsupported version.
 */
async function parseResolvedNoteManifest(
  noteContent: string,
  commit: string,
  io: UserIOContext,
): Promise<SyncManifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(noteContent) as unknown;
  } catch {
    throw new Error(
      `Corrupt git note on ${await shortHash(io.exec, commit)} — JSON parse failed. ` +
      "The note may have been manually edited or partially written. " +
      "Try a different ancestor with `arc user load`, or `arc user save` to overwrite.",
    );
  }

  const raw = parsed as Record<string, unknown>;
  if (
    (raw.version !== 1 && raw.version !== 2) ||
    typeof raw.files !== "object" ||
    raw.files === null
  ) {
    throw new Error(
      `Unsupported note format on ${await shortHash(io.exec, commit)} ` +
      `(version ${JSON.stringify(raw.version ?? "unknown")}). ` +
      "This note may have been created by a newer version of ARC. " +
      "Update the CLI and try again, or `arc user save` to overwrite.",
    );
  }
  return parsed as SyncManifest;
}

/**
 * Merge cross-WU flat files across the recent-note window. Each cross-WU file
 * present in any note is merged from its content in every note that carries it
 * (recency order preserved), so entries authored in parallel worktrees survive
 * rather than being clobbered by the most-recent note.
 */
function mergeCrossWuFromNotes(
  recentNotes: readonly RecentNote[],
): { files: Record<string, string>; warnings: string[] } {
  const perNoteFiles = recentNotes.map((note) => parseManifestFiles(note.content) ?? {});

  const crossWuNames: string[] = [];
  const seen = new Set<string>();
  for (const noteFiles of perNoteFiles) {
    for (const path of Object.keys(noteFiles)) {
      if (!seen.has(path) && isIdentityGlobalManifestPath(path)) {
        seen.add(path);
        crossWuNames.push(path);
      }
    }
  }

  const files: Record<string, string> = {};
  const warnings: string[] = [];
  for (const name of crossWuNames) {
    const notesForFile: MergeNote[] = [];
    for (const noteFiles of perNoteFiles) {
      const content = noteFiles[name];
      if (typeof content === "string") notesForFile.push({ content });
    }
    const merged = mergeCrossWuFile(name, notesForFile);
    files[name] = merged.content;
    warnings.push(...merged.malformed);
  }
  return { files, warnings };
}

/**
 * Stamp removal tombstones into the cross-WU files of a to-be-saved manifest.
 *
 * Each cross-WU flat file is diffed against the entry identities recorded in
 * the materialized-baseline stamp: an entry materialized before and absent now
 * earns a `## Removed:` marker. Per-WU subdir files and entries never
 * materialized to disk are left untouched. Mutates the manifest in place — the
 * augmented content is what gets noted and verified.
 */
function applyRemovalTombstones(
  manifest: SyncManifest,
  baselineEntries: readonly MaterializedBaselineEntry[],
  now: string,
): void {
  for (const [name, content] of Object.entries(manifest.files)) {
    if (!isIdentityGlobalManifestPath(name)) continue;

    const priorEntries = baselineEntries.filter((entry) => entry.path === name);
    if (priorEntries.length === 0) continue;

    manifest.files[name] = appendRemovalTombstonesFromEntries(name, content, priorEntries, now);
  }
}

function filesInSubdirs(
  files: Record<string, string>,
  subdirs: ReadonlySet<string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).filter(([path]) => {
      const wu = wuNameOfPath(path);
      return wu !== null && subdirs.has(wu);
    }),
  );
}

function buildBackupManifest(
  localFiles: Record<string, string>,
  reconciledFiles: Record<string, string>,
): SyncManifest {
  return {
    version: 2,
    files: { ...localFiles, ...reconciledFiles },
  };
}

async function writeTimestampedBackup(
  internalDir: string,
  io: UserIOContext,
  manifest: SyncManifest,
): Promise<string> {
  const backupFilename = createTimestampedBackupFilename();
  await ensureDir(internalDir, io.mkdir);
  await io.writeFile(join(internalDir, backupFilename), JSON.stringify(manifest));
  await pruneTimestampedBackups(internalDir, io.readDir);
  return backupFilename;
}

async function verifyMaterializedSplitUserManifest(
  options: {
    cwd: string;
    io: UserIOContext;
    identity: string;
    currentWuName?: string;
    resolver: UserSurfaceResolver;
  },
  commit: string,
  manifest: SyncManifest,
): Promise<void> {
  const shortCommit = await formatLoadSourceCommit(options.io, commit);
  const expectedFiles: Record<string, string> = {};
  const readbackFiles: Record<string, string> = {};

  for (const [name, content] of Object.entries(manifest.files)) {
    if (!isSafeManifestPath(name)) continue;
    const materializedPath = resolveMaterializedManifestPath(options, name);
    if (materializedPath === null) continue;
    expectedFiles[name] = content;

    let actual: string;
    try {
      actual = await options.io.readFile(materializedPath);
    } catch {
      throw new UserLoadVerificationError(
        `Load verification failed for note ${shortCommit}: materialized file "${name}" was missing or unreadable.`,
      );
    }
    readbackFiles[name] = actual;
  }

  const expectedHash = hashSyncManifest({ version: manifest.version, files: expectedFiles });
  const actualHash = hashSyncManifest({ version: manifest.version, files: readbackFiles });
  if (expectedHash !== actualHash) {
    throw new UserLoadVerificationError(
      `Load verification failed for note ${shortCommit}: materialized file content did not match the loaded manifest.`,
    );
  }
}

function resolveMaterializedManifestPath(
  options: {
    currentWuName?: string;
    resolver: UserSurfaceResolver;
  },
  manifestPath: string,
): string | null {
  if (isIdentityGlobalManifestPath(manifestPath)) {
    return join(options.resolver.identityGlobalRoot, manifestPath);
  }

  const currentWuName = options.currentWuName;
  if (currentWuName === undefined) return null;
  const prefix = `${currentWuName}/`;
  if (!manifestPath.startsWith(prefix)) return null;
  return join(options.resolver.workUnitRoot(currentWuName), manifestPath.slice(prefix.length));
}

async function formatLoadSourceCommit(
  io: UserIOContext,
  commit: string,
): Promise<string> {
  if (commit === NO_COMPARABLE_SOURCE_COMMIT) return commit;
  return shortHash(io.exec, commit);
}

async function readNotesRefTip(
  io: UserIOContext,
  identity: string,
): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["rev-parse", "--verify", `refs/notes/${notesRef(identity)}`]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function verifySavedNote(
  io: UserIOContext,
  identity: string,
  commit: string,
  expectedManifest: SyncManifest,
): Promise<void> {
  const ref = notesRef(identity);
  const readback = await io.readNote(ref, commit);
  const shortCommit = await shortHash(io.exec, commit);

  if (readback === null) {
    throw new UserSaveVerificationError(
      `Save verification failed on ${shortCommit}: git note readback was missing.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readback);
  } catch {
    throw new UserSaveVerificationError(
      `Save verification failed on ${shortCommit}: git note readback was not valid JSON.`,
    );
  }

  if (!isSyncManifest(parsed)) {
    throw new UserSaveVerificationError(
      `Save verification failed on ${shortCommit}: git note readback had an unsupported manifest shape.`,
    );
  }

  const expectedHash = hashSyncManifest(expectedManifest);
  const actualHash = hashSyncManifest(parsed);
  if (actualHash !== expectedHash) {
    throw new UserSaveVerificationError(
      `Save verification failed on ${shortCommit}: git note readback did not match the saved manifest.`,
    );
  }
}

export function hashSyncManifest(
  manifest: SyncManifest,
): string {
  const normalized = normalizeManifest(manifest);
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

function isSyncManifest(value: unknown): value is SyncManifest {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Record<string, unknown>;
  if (record.version !== 1 && record.version !== 2) return false;
  if (
    typeof record.files !== "object" ||
    record.files === null ||
    Array.isArray(record.files)
  ) {
    return false;
  }

  return Object.values(record.files as Record<string, unknown>)
    .every((content) => typeof content === "string");
}

function normalizeManifest(
  manifest: SyncManifest,
): SyncManifest {
  const sortedEntries = Object.entries(manifest.files)
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    version: manifest.version,
    files: Object.fromEntries(sortedEntries),
  };
}

/** Resolve the current user note by HEAD-reachable causal order and pointer fallback. */
export async function findNearestUserNote(
  options: UserLoadOptions,
): Promise<NearestNoteSearch> {
  const { cwd, io, identity } = options;
  const localSyncState = await readLocalSyncState(cwd, io, identity);

  return resolveNearestUserNote({
    io,
    identity,
    currentWuName: options.currentWuName,
    localSyncState,
  });
}

async function resolveNearestUserNote(
  input: NearestUserNoteResolutionInput,
): Promise<NearestNoteSearch> {
  const { io, identity, currentWuName } = input;
  const ref = notesRef(identity);
  const fullRef = `refs/notes/${ref}`;

  let headHash: string;
  try {
    const { stdout } = await io.exec("git", ["rev-parse", "HEAD"]);
    headHash = stdout.trim();
  } catch {
    headHash = "";
  }

  const annotatedCommits = await listAnnotatedNoteCommits(io.exec, fullRef);
  if (annotatedCommits.length === 0) {
    return { note: null };
  }

  const reachableCommits = await filterCommitsReachableFromHead(io.exec, annotatedCommits);
  const reachableCandidates = await buildReachableNoteCandidates({
    io,
    fullRef,
    reachableCommits,
    currentWuName,
  });
  const maximalCommits = await reduceCommitsToCausallyMaximal(
    io.exec,
    reachableCandidates.map((candidate) => candidate.commit),
  );
  const selected = selectMaximalCandidate(
    reachableCandidates,
    maximalCommits,
    input.localSyncState,
  );
  if (!selected) {
    const fallback = await readOffAncestryPointerFallback({
      io,
      fullRef,
      currentWuName,
      localSyncState: input.localSyncState,
    });
    if (fallback !== null) {
      return {
        note: {
          content: fallback.content,
          commit: fallback.commit,
          reachableFromHead: false,
          fromAncestor: false,
          ancestorDistance: 0,
        },
      };
    }
    return { note: null };
  }

  const content = selected.content ?? await readNoteContentAtAnnotatedCommit(io.exec, fullRef, selected.commit);
  if (content === null) {
    return { note: null };
  }

  const ancestorDistance = await countCommitsSince(io, selected.commit);

  return {
    note: {
      content,
      commit: selected.commit,
      reachableFromHead: true,
      fromAncestor: selected.commit !== headHash,
      ancestorDistance,
    },
  };
}

async function buildReachableNoteCandidates(input: {
  io: UserIOContext;
  fullRef: string;
  reachableCommits: string[];
  currentWuName: string | undefined;
}): Promise<ReachableNoteCandidate[]> {
  const { io, fullRef, reachableCommits, currentWuName } = input;
  if (currentWuName === undefined) {
    return reachableCommits.map((commit) => ({ commit }));
  }

  const reads = await Promise.all(
    reachableCommits.map(async (commit) => ({
      commit,
      content: await readNoteContentAtAnnotatedCommit(io.exec, fullRef, commit),
    })),
  );

  return reads.filter(
    (read): read is { commit: string; content: string } =>
      read.content !== null && noteManifestContainsWu(read.content, currentWuName),
  );
}

async function readOffAncestryPointerFallback(input: {
  io: UserIOContext;
  fullRef: string;
  currentWuName: string | undefined;
  localSyncState: ResolutionPointer | null;
}): Promise<{ commit: string; content: string } | null> {
  const { io, fullRef, currentWuName, localSyncState } = input;
  if (localSyncState?.sourceOperation !== "save") return null;

  const content = await readNoteContentAtAnnotatedCommit(
    io.exec,
    fullRef,
    localSyncState.sourceCommit,
  );
  if (content === null) return null;
  if (currentWuName !== undefined && !noteManifestContainsWu(content, currentWuName)) return null;

  return { commit: localSyncState.sourceCommit, content };
}

function selectMaximalCandidate(
  candidates: ReachableNoteCandidate[],
  maximalCommits: string[],
  localSyncState: ResolutionPointer | null,
): ReachableNoteCandidate | null {
  if (maximalCommits.length === 0) return null;

  const maximalSet = new Set(maximalCommits);
  const maximalCandidates = candidates.filter((candidate) => maximalSet.has(candidate.commit));
  if (maximalCandidates.length === 0) return null;
  if (maximalCandidates.length === 1) return maximalCandidates[0] ?? null;

  const pointerMatch = maximalCandidates.find(
    (candidate) => candidate.commit === localSyncState?.sourceCommit,
  );
  if (pointerMatch !== undefined) return pointerMatch;

  return [...maximalCandidates]
    .sort((left, right) => left.commit.localeCompare(right.commit))[0] ?? null;
}

/**
 * Best-effort extraction of a manifest's `files` map. Returns `null` when the
 * content isn't valid JSON or lacks a `files` object — callers treat that as
 * "not a usable manifest" without throwing.
 */
function parseManifestFiles(noteContent: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(noteContent);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const files = (parsed as { files?: unknown }).files;
  if (typeof files !== "object" || files === null) return null;
  return files as Record<string, unknown>;
}

/** Whether a note's serialized manifest carries any file under the given WU's subdir. */
function noteManifestContainsWu(noteContent: string, wuName: string): boolean {
  const files = parseManifestFiles(noteContent);
  if (!files) return false;
  return Object.keys(files).some((path) => wuNameOfPath(path) === wuName);
}

/**
 * Resolve which present per-WU subdirs are reconcilable: those whose WU has
 * shipped (read from the `origin/<base>` `completed/` tree — the canonical,
 * branch-independent oracle). Partitioning is {@link planRetiredSubdirReconcile}.
 * Pure planning — performs no removal, so a caller can gate its backup on a
 * non-empty result.
 *
 * @returns The reconcilable subdir names, in `localFiles` subdir order.
 */
async function resolveReconcilableSubdirs(params: {
  cwd: string;
  io: UserIOContext;
  localFiles: Record<string, string>;
}): Promise<string[]> {
  const localSubdirs = subdirsFromPaths(Object.keys(params.localFiles));
  if (localSubdirs.length === 0) return [];

  const { settings } = await readConfigSettings(params.cwd);
  const shipped = await readShippedWorkUnitsFromRef(
    params.io.exec,
    `origin/${settings["branch.base"]}`,
  );
  const inFlight = await resolveSameMachineInFlightSubdirs(params.io, localSubdirs);
  return planRetiredSubdirReconcile({ localSubdirs, shipped, inFlight }).reconcile;
}

async function resolveSameMachineInFlightSubdirs(
  io: UserIOContext,
  localSubdirs: readonly string[],
): Promise<Set<string>> {
  const candidates = new Set(localSubdirs);
  const inFlight = new Set<string>();
  if (candidates.size === 0) return inFlight;

  let roster;
  try {
    roster = await runWorktreeRoster({
      exec: io.exec,
      fs: {
        readdir: async (path) => (await io.readDir(path)).map((entry) => entry.name),
        readFile: io.readFile,
      },
    });
  } catch {
    return inFlight;
  }

  for (const entry of roster.entries) {
    if (entry.metaFilePath === undefined || entry.state === "Shipped") continue;
    const wuName = wuNameFromMetaFilePath(entry.metaFilePath);
    if (wuName !== null && candidates.has(wuName)) inFlight.add(wuName);
  }

  return inFlight;
}

function wuNameFromMetaFilePath(path: string): string | null {
  const name = basename(path);
  if (!name.startsWith("meta-") || !name.endsWith(".md")) return null;
  return name.slice("meta-".length, -".md".length);
}

/** Recursively remove each reconciled subdir; returns the removed set. */
async function removeReconciledSubdirs(params: {
  cwd: string;
  identity: string;
  reconcile: readonly string[];
}): Promise<Set<string>> {
  for (const subdir of params.reconcile) {
    await removeStaleUserWuSubdir({ cwd: params.cwd, identity: params.identity, subdir });
  }
  return new Set(params.reconcile);
}

/**
 * Reconcile the local user tree's retired per-WU subdirs — the reversible cleanup
 * `arc user open` runs *before* its stale-subdir prompt, so a shipped, drift-free
 * subdir is removed (recoverable from the backup) with no confirm: its shipped
 * status is proof, not a decision the operator must make.
 *
 * The same reconcile the load path performs inline, minus the note
 * materialization — usable from any entry point that holds only `cwd` / `io` /
 * `identity`. The pre-removal backup is written only once a removal is actually
 * pending, so a no-op open (nothing reconcilable) leaves no snapshot behind.
 * No-ops cleanly when the user dir is absent or empty.
 *
 * @returns Names of the reconciled (removed) subdirs; empty when nothing qualified.
 */
export async function reconcileRetiredSubdirsStandalone(params: {
  cwd: string;
  io: UserIOContext;
  identity: string;
}): Promise<Set<string>> {
  const { cwd, io, identity } = params;
  const userDir = join(cwd, ".arc", "user", identity);

  let localManifest: SyncManifest;
  try {
    localManifest = (await serialize(userDir, io.readDir, io.readFile)).manifest;
  } catch {
    return new Set();
  }
  const localFiles = localManifest.files;
  if (Object.keys(localFiles).length === 0) return new Set();

  const reconcile = await resolveReconcilableSubdirs({ cwd, io, localFiles });
  if (reconcile.length === 0) return new Set();

  // Back up only once a removal is pending: the snapshot exists to make the
  // reconcile recoverable, so a no-op open writes nothing.
  const internalDir = getUserInternalDir(cwd, identity);
  await ensureDir(internalDir, io.mkdir);
  await io.writeFile(join(internalDir, createTimestampedBackupFilename()), JSON.stringify(localManifest));
  await pruneTimestampedBackups(internalDir, io.readDir);

  return removeReconciledSubdirs({ cwd, identity, reconcile });
}

/**
 * Render one orphan classification to a user-facing notice string. The seam where
 * the structured classification ({@link classifyOrphans}) flattens to a string;
 * a later drift tier adds classification kinds, not new call sites.
 */
function renderOrphanNotice(classification: OrphanClassification, backupFilename: string): string {
  const backedUp = `backed up to .internal/${backupFilename}`;
  switch (classification.kind) {
    case "grouped-retirement":
      return (
        `User subdir "${classification.subdir}/" (${classification.files.length} file(s)) not in saved ` +
        `manifest — left in place; ${backedUp}. Remove the subdir if its work unit is retired.`
      );
    case "rename-candidate":
      return (
        `Local file "${classification.from}" not in saved manifest — looks like a rename to ` +
        `"${classification.to}" (content matches); ${backedUp}`
      );
    case "generic":
      return `Local file "${classification.name}" not in saved manifest — ${backedUp}`;
  }
}

/**
 * Restrict a manifest to what the current load should materialize: identity-global
 * flat files plus the current WU's own subdir, dropping other WUs' subdirs. A bare
 * root `SESSION-NOTES.md` is not identity-global (see {@link isIdentityGlobalManifestPath}),
 * so it is dropped rather than materialized. With no current WU the per-WU restore
 * no-ops (only identity-global flat survives).
 */
function filterManifestForWu(
  manifest: SyncManifest,
  currentWuName: string | undefined,
): SyncManifest {
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(manifest.files)) {
    if (isIdentityGlobalManifestPath(path) || wuNameOfPath(path) === currentWuName) {
      files[path] = content;
    }
  }
  return { version: manifest.version, files };
}

async function countCommitsSince(
  io: UserIOContext,
  commit: string,
): Promise<number> {
  try {
    const { stdout } = await io.exec("git", ["rev-list", "--count", `${commit}..HEAD`]);
    return Number.parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

export async function listBackupFiles(
  cwd: string,
  io: UserIOContext,
  identity: string,
): Promise<string[]> {
  const resolver = await resolveUserSurfaceResolver({ cwd, identity, exec: io.exec });
  const roots = uniquePaths([resolver.identityGlobalRoot, join(cwd, ".arc", "user", identity)]);
  const internalDirs = uniquePaths([join(resolver.identityGlobalRoot, ".internal"), getUserInternalDir(cwd, identity)]);
  const backupFiles = [
    ...(await Promise.all(internalDirs.map((dir) => readBackupNames(dir, io.readDir)))).flat(),
    ...(await Promise.all(roots.map((dir) => readBackupNames(dir, io.readDir)))).flat(),
  ];
  const legacy = backupFiles.filter((name) => name === BACKUP_FILENAME);
  const timestamped = backupFiles
    .filter((name) => isTimestampedBackupFile(name))
    .sort((left, right) => right.localeCompare(left));
  return [...new Set([...timestamped, ...legacy])];
}

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

function createTimestampedBackupFilename(): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return `${BACKUP_TIMESTAMPED_PREFIX}${timestamp}${BACKUP_TIMESTAMPED_SUFFIX}`;
}

function isTimestampedBackupFile(name: string): boolean {
  return name.startsWith(BACKUP_TIMESTAMPED_PREFIX) && name.endsWith(BACKUP_TIMESTAMPED_SUFFIX);
}

async function pruneTimestampedBackups(
  backupDir: string,
  readDir: UserIOContext["readDir"],
): Promise<void> {
  const entries = await readDir(backupDir);
  const timestamped = entries
    .map((entry) => entry.name)
    .filter(isTimestampedBackupFile)
    .sort((left, right) => right.localeCompare(left));

  const toDelete = timestamped.slice(BACKUP_RETENTION);
  for (const filename of toDelete) {
    try {
      await rm(join(backupDir, filename), { force: true });
    } catch {
      // Best-effort pruning; backup creation already succeeded.
    }
  }
}

async function readBackupNames(
  dir: string,
  readDir: UserIOContext["readDir"],
): Promise<string[]> {
  try {
    return (await readDir(dir))
      .map((entry) => entry.name)
      .filter((name) => name === BACKUP_FILENAME || isTimestampedBackupFile(name));
  } catch {
    return [];
  }
}
