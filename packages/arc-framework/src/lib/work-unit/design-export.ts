/** One-way export of a stored specification into the code repository for review. */
import * as filesystem from "node:fs/promises";
import { join, posix } from "node:path";
import { resolveArcPath } from "../layout/index.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import type { GitExec } from "../git/exec.js";
import type { Store } from "../store/contract.js";
import { recordReferences, type OwnerIdentity } from "../store/identity.js";
import { readWorkUnit, usesOffBranchState, workUnitArtifactName } from "../store/lifecycle-write.js";

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

/** Write and stage the stored specification, skipping matching response replays. */
export async function exportWorkUnitSpec(input: DesignExportInput): Promise<DesignExportResult | null> {
  if (!usesOffBranchState(input.store) || input.store === undefined || input.trackDesignDocs !== "specs") return null;
  const slug = SlugSchema.parse(input.workUnit);
  const meta = await readWorkUnit(input.store, slug, input.owner);
  if (meta.status === "refused") throw new Error(`${meta.refusal.condition} ${meta.refusal.remedy.text}`);
  const spec = await input.store.read({ reference: recordReferences["work-item/spec"](meta.result.reference.owner) });
  if (spec.status === "refused") {
    if (spec.refusal.code === "not-found") return null;
    throw new Error(`${spec.refusal.condition} ${spec.refusal.remedy.text}`);
  }
  const path = posix.join(resolveArcPath({ kind: "work-unit-export", slug }), workUnitArtifactName(slug, "spec"));
  const fs = input.fs ?? filesystem;
  let prior: string | null;
  try { prior = await fs.readFile(join(input.cwd, path), "utf8"); }
  catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    prior = null;
  }
  if (prior === spec.result.content) {
    if (input.stageMatching === true) await input.exec("git", ["add", "--", path], { cwd: input.cwd });
    return null;
  }
  await fs.mkdir(join(input.cwd, posix.dirname(path)), { recursive: true });
  await fs.writeFile(join(input.cwd, path), spec.result.content, "utf8");
  try { await input.exec("git", ["add", "--", path], { cwd: input.cwd }); }
  catch (error) {
    if (prior === null) await fs.rm(join(input.cwd, path));
    else await fs.writeFile(join(input.cwd, path), prior, "utf8");
    throw error;
  }
  return { path, overwritten: prior !== null };
}
