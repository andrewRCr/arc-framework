/**
 * `promoteErrand` — the composed core of `arc errand promote`.
 *
 * Promotes a full-protection errand that has crossed a wrapper floor into a work
 * unit: renames the errand branch into the WU branch (commits preserved), mints
 * the backing `meta-<name>.md`, and retires the errand record. The crossing-*out*
 * seam of the errand lattice — like `open`/`close`/`retire` it composes shipped
 * primitives (`renderMetaFile` + branch rename + record removal/push) directly,
 * rather than routing through the WU transition executor (whose table is keyed
 * over WU states an errand does not occupy).
 *
 * Which floor the work crossed routes the WU's entry stage: a **derivation**
 * crossing (design must now be authored) enters planning (`Planning` +
 * `Current Workflow: draft-design`); a **scale** crossing (a determinate concern
 * that now needs a durable cross-session plan) enters `Active` for a brief +
 * task-list backfill. Commits already exist on the branch, so neither runs an
 * activation ceremony.
 *
 * The git seams and identity are injected (three-layer architecture).
 *
 * @module
 */

import { join } from "node:path";

import { renderMetaFile, type MetaFieldOverrides } from "../active/meta-reader.js";
import { ensureDir, type MkdirFn, type ReadFileFn, type WriteFileFn } from "../template/files.js";
import { reconcileErrandPush, type ErrandPushOutcome } from "./merge.js";
import { readErrandRecord, removeErrandRecord, type ErrandRecord } from "./record.js";
import type { ErrandRecordIO } from "./ref-tree.js";

/** Which wrapper floor the errand crossed — routes the WU's entry stage. */
export type PromoteFloor = "derivation" | "scale";

/** Filesystem seam for minting the WU meta and probing for a name collision. */
export interface PromoteErrandFs {
  mkdir: MkdirFn;
  writeFile: WriteFileFn;
  readFile: ReadFileFn;
}

/** The seams `promoteErrand` drives: the record IO, a meta-write fs seam, and the repo root. */
export interface PromoteErrandContext {
  io: ErrandRecordIO;
  fs: PromoteErrandFs;
  cwd: string;
}

/** Operands for {@link promoteErrand}. */
export interface PromoteErrandParams {
  /** The errand slug to promote — its logical identity and the record's tree key. */
  slug: string;
  /** The new work-unit name (the meta filename stem and branch leaf). */
  name: string;
  /** The WU branch nature-type prefixing the name (`feat` / `fix` / …). */
  type: string;
  /** Which floor the errand crossed — routes the entry stage. */
  floor: PromoteFloor;
  /** Identity owning the promoted WU — the meta `Owner`. */
  owner: string;
  /** WU priority for the meta; the meta-field default applies when omitted. */
  priority?: string;
  /** WU `Class` for the meta; defaults to `[TBD]` (resolved at the planning entry) when omitted. */
  class?: string;
}

/** Outcome of {@link promoteErrand}. */
export type PromoteErrandResult =
  | { kind: "promoted"; record: ErrandRecord; branch: string; metaPath: string; push: ErrandPushOutcome }
  | { kind: "no-record"; slug: string }
  | { kind: "name-taken"; metaPath: string };

/** The active-work directory the promoted meta lands in, repo-relative. */
const ACTIVE_DIR = ".arc/active";

/**
 * Promote an errand to a work unit: rename its branch (commits preserved), mint
 * the backing meta at the floor-dictated stage, and retire the record.
 *
 * Resolves the record by slug — an absent record is `no-record`. Refuses with
 * `name-taken` when a `meta-<name>.md` already exists (no clobber of a live WU).
 * Otherwise renames the record's branch to `<type>/<name>`, writes the meta, then
 * removes the record and pushes the removal — leaving the renamed branch
 * untouched. The record is retired **last**, so any failure before it leaves the
 * errand recoverable.
 *
 * @param ctx - The record IO, the meta-write fs seam, and the repo root.
 * @param params - The slug, new WU name/type, crossed floor, owner, and optional priority/class.
 * @returns The promotion outcome — promoted, no-record, or name-taken.
 */
export async function promoteErrand(
  ctx: PromoteErrandContext,
  params: PromoteErrandParams,
): Promise<PromoteErrandResult> {
  const slug = params.slug.trim();
  if (slug === "") throw new Error("promoteErrand: slug must be non-empty");
  const name = params.name.trim();
  if (name === "") throw new Error("promoteErrand: name must be non-empty");
  const type = params.type.trim();
  if (type === "") throw new Error("promoteErrand: type must be non-empty");

  const { io, fs, cwd } = ctx;

  const record = await readErrandRecord(io, slug);
  if (record === null) return { kind: "no-record", slug };

  const metaPath = join(ACTIVE_DIR, `meta-${name}.md`);
  if (await fileExists(fs.readFile, join(cwd, metaPath))) {
    return { kind: "name-taken", metaPath };
  }

  const branch = `${type}/${name}`;
  // Rename the record's branch into the WU branch — preserve commits, prefix-agnostic.
  await io.exec("git", ["branch", "-m", record.branch, branch]);

  // Mint the backing meta at the stage the crossed floor dictates.
  await ensureDir(join(cwd, ACTIVE_DIR), fs.mkdir);
  await fs.writeFile(join(cwd, metaPath), renderMetaFile(name, metaOverridesFor(params, branch)));

  // Retire the record last — the renamed branch is untouched, so this never
  // strands commits, and a failure before here leaves the errand recoverable.
  await removeErrandRecord(io, slug);
  const push = await reconcileErrandPush(io);

  return { kind: "promoted", record, branch, metaPath, push };
}

/** Build the meta field overrides for a promotion, routed by the crossed floor. */
function metaOverridesFor(params: PromoteErrandParams, branch: string): MetaFieldOverrides {
  const overrides: MetaFieldOverrides = {
    Owner: params.owner,
    Branch: branch,
    "Last Completed": "Errand promoted to work unit",
  };
  if (params.priority !== undefined) overrides.Priority = params.priority;
  if (params.class !== undefined) overrides.Class = params.class;

  if (params.floor === "derivation") {
    // Design must now be authored — enter planning at the draft-design stage.
    overrides.State = "Planning";
    overrides["Current Workflow"] = "draft-design";
    overrides["Next Action"] = "Resolve the design before further implementation.";
  } else {
    // A determinate concern that now needs a durable plan — enter Active for a
    // brief + task-list backfill; commits already exist, so no activation ceremony.
    overrides.State = "Active";
    overrides["Next Action"] = "Backfill a brief spec and task list, then continue implementation.";
  }
  return overrides;
}

/** Whether a path is readable — the meta-collision probe (absent file → `false`). */
async function fileExists(readFile: ReadFileFn, path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}
