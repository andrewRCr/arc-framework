/** Gives a fixture's base a recorded rename, so delivery reads its rename history there with state off the branch. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalize } from "../../src/lib/kernel/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { TRANSITION_RECORD_NAMESPACE } from "../../src/lib/work-unit/transition-record-store.js";
import { makeGitExec } from "./integration.js";

/** Write and stage one rename between two names no fixture uses, for the caller's next commit.
 * @param cwd - The checkout whose branch the commit lands on; the record is staged past any ignore rule.
 */
export async function stageUnrelatedTransitionRecord(cwd: string): Promise<void> {
  const record = LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: "retired-unit" }, kind: "rename",
    successors: [{ name: "renamed-unit" }], incoming: [] });
  const path = join(TRANSITION_RECORD_NAMESPACE, "retired-unit-0.json");
  await mkdir(join(cwd, TRANSITION_RECORD_NAMESPACE), { recursive: true });
  await writeFile(join(cwd, path), canonicalize(record), "utf8");
  await makeGitExec(cwd)("git", ["add", "-f", "--", path]);
}
