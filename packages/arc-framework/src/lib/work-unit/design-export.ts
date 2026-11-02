/** One-way export of a stored specification into the code repository for review. */
import * as filesystem from "node:fs/promises";
import { join, posix } from "node:path";
import { resolveWorkUnitSpecExportPath } from "../layout/index.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import type { GitExec } from "../git/exec.js";
import type { Store } from "../store/contract.js";
import { recordReferences, type OwnerIdentity } from "../store/identity.js";
import { readWorkUnit, usesOffBranchState } from "../store/lifecycle-write.js";
import { StoreRefusalError } from "../store/refusal-error.js";
import { recordConflictRefusal } from "../store/conflict-diagnostics.js";

/** A review copy written from its stored specification. */
export interface DesignExportResult { path: string; overwritten: boolean }

interface DesignExportInput {
  cwd: string;
  workUnit: string;
  store?: Store;
  owner?: OwnerIdentity;
  trackDesignDocs: string;
  stageMatching?: boolean;
  exec: GitExec;
  fs?: Pick<typeof filesystem, "readFile" | "mkdir" | "writeFile" | "rm">;
}

// The stored specification's content, absent when none is stored; a conflicted one exports neither side.
async function readStoredSpec(store: Store, slug: string, owner?: OwnerIdentity): Promise<string | null> {
  const offBranch = store.capabilities.stateOffBranch;
  const meta = await readWorkUnit(store, slug, owner);
  if (meta.status === "refused") throw new StoreRefusalError(meta.refusal, offBranch);
  const spec = await store.read({ reference: recordReferences["work-item/spec"](meta.result.reference.owner) });
  if (spec.status === "refused") {
    if (spec.refusal.code === "not-found") return null;
    throw new StoreRefusalError(spec.refusal, offBranch);
  }
  if (spec.result.conflicts.length > 0) {
    throw new StoreRefusalError(recordConflictRefusal(spec.result, `The stored specification for \`${slug}\``, "design-export.spec-conflict"), offBranch);
  }
  return spec.result.content;
}

/** Write and stage the stored specification, skipping matching response replays. */
export async function exportWorkUnitSpec(input: DesignExportInput): Promise<DesignExportResult | null> {
  if (!usesOffBranchState(input.store) || input.store === undefined || input.trackDesignDocs !== "specs") return null;
  const slug = SlugSchema.parse(input.workUnit);
  const content = await readStoredSpec(input.store, slug, input.owner);
  if (content === null) return null;
  const path = resolveWorkUnitSpecExportPath(slug);
  const fs = input.fs ?? filesystem;
  let prior: string | null;
  try { prior = await fs.readFile(join(input.cwd, path), "utf8"); }
  catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    prior = null;
  }
  if (prior === content) {
    if (input.stageMatching === true) await input.exec("git", ["add", "--", path], { cwd: input.cwd });
    return null;
  }
  await fs.mkdir(join(input.cwd, posix.dirname(path)), { recursive: true });
  await fs.writeFile(join(input.cwd, path), content, "utf8");
  try { await input.exec("git", ["add", "--", path], { cwd: input.cwd }); }
  catch (error) {
    if (prior === null) await fs.rm(join(input.cwd, path));
    else await fs.writeFile(join(input.cwd, path), prior, "utf8");
    throw error;
  }
  return { path, overwritten: prior !== null };
}
