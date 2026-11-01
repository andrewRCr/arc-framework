/** A real projection seeded from a store: stamped files at the paths a test gives, and the index that matches them. */
import { link, lstat, mkdir, readFile, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createTempRepoCore } from "../../temp-repo.js";
import type { GitDirectoryFileAccess } from "../../../../src/lib/git/directories.js";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import { SlugSchema, type Slug } from "../../../../src/lib/kernel/index.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { RecordReference } from "../../../../src/lib/store/identity.js";
import { gitBlobId, type ObjectFormat } from "../../../../src/lib/store/projection/blob-id.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { commitProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { ProjectionIndex, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import {
  ensureProjectionStateFolder, locateProjection, type ProjectionLocation,
} from "../../../../src/lib/store/projection/location.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";

/** One record to project, at its repository-relative path. */
export interface SeededFile { readonly reference: RecordReference; readonly path: string }

/** A seeded worktree: its root, where its projection state lives, and the index written there. */
export interface SeededProjection {
  readonly checkout: string;
  readonly location: ProjectionLocation;
  readonly index: ProjectionIndex;
}

const fs: GitDirectoryFileAccess = { lstat, readFile: (path) => readFile(path, "utf8"), realpath };
const noGit: GitExec = (_cmd, args) => Promise.reject(new Error(`no Git process expected: git ${args.join(" ")}`));

/**
 * Seed a projection in a new temporary repository, which the caller removes. Each record is read from the store and
 * laid at its path, a Markdown file stamped with its stored content's blob id, and the index records each file's stat,
 * what was written, and its base, written as an index commit, so the reference follows it.
 * @param input - The store to read, the files to lay, and the identity and object format to project under.
 * @returns The seeded worktree.
 */
export async function seedProjection(input: {
  store: Store; files: readonly SeededFile[]; identity?: Slug; format?: ObjectFormat;
}): Promise<SeededProjection> {
  const format = input.format ?? "sha1";
  const checkout = await createTempRepoCore({ prefix: "arc-projection-seeded-", objectFormat: format });
  const location = await locateProjection(checkout, { fs, exec: noGit });
  if (await ensureProjectionStateFolder(location) !== "ready") throw new Error("The seeded repository has no Git directory");
  const entries: Record<string, RecordEntry> = {};
  const staged: { path: string; location: string }[] = [];
  for (const file of input.files) {
    const prepared = await stageFile(input.store, checkout, file, format);
    entries[file.path] = prepared.entry;
    staged.push({ path: file.path, location: prepared.location });
  }
  const state = await input.store.version();
  if (state.status !== "ok") throw new Error(`The store refused version(): ${state.refusal.code}`);
  const index = await commitProjectionIndex({
    location, checkout, installing: new Set(Object.keys(entries)),
    index: {
      format: 1, state: state.result, withheldCopies: [], tripwires: {}, ignoreFiles: null, ignoreExcludesFile: null, entries,
      projectedUnder: {
        view: { mode: "mine", pins: [] }, identity: input.identity ?? SlugSchema.parse("andrew"), claim: null,
        layoutActive: "nested",
      },
    },
  });
  for (const file of staged) {
    const target = join(checkout, file.path);
    await mkdir(dirname(target), { recursive: true });
    await link(join(checkout, file.location), target);
    await rm(join(checkout, file.location));
  }
  return { checkout, location, index };
}

async function stageFile(store: Store, checkout: string, file: SeededFile, format: ObjectFormat): Promise<{ entry: RecordEntry; location: string }> {
  const read = await store.read({ reference: file.reference });
  if (read.status !== "ok") throw new Error(`The store refused to read ${file.path}: ${read.refusal.code}`);
  const record = read.result;
  const blob = gitBlobId(record.content, format);
  const staged = await stageRecordFile({ checkout, path: file.path, record, replacing: blob, format,
    writer: { pid: process.pid, processInstance: "seed-projection", processScope: "seed-projection" } });
  return { location: staged.location, entry: {
    kind: "record", reference: record.reference, stat: await readStat(join(checkout, staged.location)), written: staged.written,
    base: { blob, version: record.version }, markers: null, notices: [], unshown: [], protected: false, changed: false,
    pending: false, withheld: false, refused: null, persisted: null, inProgress: null, copies: [],
  } };
}
