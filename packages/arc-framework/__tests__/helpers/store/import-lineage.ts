/** Legacy terminal and rename transitions over imported live and archived owners. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { LineageRecordSchema, writeLineageRecord, type LineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";

export const IMPORT_TRANSITIONS: readonly LineageRecord[] = [
  { schemaVersion: 2, origin: { name: "cut-origin" }, kind: "decompose", successors: [{ name: "alpha" }, { name: "archived" }],
    incoming: [{ dependent: { name: "also-archived" }, disposition: { kind: "replace", replacementTargets: [{ name: "last-archived" }] } }],
    outgoing: [{ prerequisite: { name: "alpha" }, members: [{ name: "archived" }] },
      { prerequisite: { name: "unheld" }, members: [{ name: "alpha" }] }] },
  { schemaVersion: 2, origin: { name: "abandoned" }, kind: "abandon", successors: [], incoming: [] },
  { schemaVersion: 2, origin: { name: "old-archived" }, kind: "rename", successors: [{ name: "archived" }], incoming: [] },
].map((record) => LineageRecordSchema.parse(record));

/** Write through the lineage producer and commit the legacy source paths. */
export async function seedImportLineage(root: string, git: GitExec): Promise<void> {
  for (const record of IMPORT_TRANSITIONS) {
    const path = join(root, resolveArcPath({ kind: "transition-record", origin: SlugSchema.parse(record.origin.name) }));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, writeLineageRecord(record));
  }
  await git("git", ["add", ".arc"]);
  await git("git", ["commit", "-m", "Seed legacy terminal transitions"]);
}
