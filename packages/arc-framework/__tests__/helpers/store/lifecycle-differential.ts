/** Real repository arrangement and independent path/identity reads for lifecycle consumers. */
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { trackedWriteFixture } from "./tracked-write-fixture.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { parseMetaRecord, type MetaRenderOverrides } from "../../../src/lib/active/meta-reader.js";
import { buildLifecycleIndex } from "../../../src/lib/work-unit/lifecycle-index.js";
import { resolveComposedLifecycleIndex } from "../../../src/lib/work-unit/composed-lifecycle-index.js";
import { listLifecycleIndex, listHeldLifecycleIndex, isLifecycleSelectedHere } from "../../../src/lib/store/lifecycle-index.js";
import { recordReferences, OwnerIdentitySchema, StateVersionSchema } from "../../../src/lib/store/identity.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import type { LifecycleEntry, LifecycleIndexOutcome } from "../../../src/lib/store/lifecycle-index.js";
import { success } from "./suite-tools.js";

/** Resolve a logical primary identity without a projected filename.
 * @param name - Owning work-unit slug.
 * @returns Validated meta reference.
 */
export const metaReference = (name: string) => recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name }));
/** Iterate a successfully completed logical lifecycle listing.
 * @param outcome - Unwrapped lifecycle listing.
 * @returns Indexed entries, with absence contributing none.
 */
export function entries(outcome: LifecycleIndexOutcome): readonly LifecycleEntry[] {
  if (outcome.status === "unreadable") throw new Error(outcome.condition);
  return outcome.status === "complete" ? outcome.index.entries() : [];
}
/** Project a caller-required path from identity placement, never from the index itself.
 * @param entry - Logical work-unit record.
 * @returns Its meta surface under the existing layout authority.
 */
export function metaPath(entry: LifecycleEntry): string {
  const value = entry.placement;
  const placement = value.kind === "active" ? { kind: "active" as const, scope: { kind: "project" as const } }
    : value.kind === "backlog" ? { ...value, cohort: (entry.fields.cohort ?? "").split("/").filter(Boolean).map((part) => SlugSchema.parse(part)) }
      : "sequence" in value ? value : undefined;
  if (!placement) throw new Error("Expected completed work-unit sequence");
  return resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: entry.reference.owner.name, placement });
}
/** Arrange every lifecycle query with actual branches, parked pointers, and complete field blocks.
 * @returns Isolated public Store, legacy readers, and independent query materialization.
 */
export async function lifecycleRepository() {
  const h = await trackedWriteFixture();
  const fs = { readFile: (path: string) => readFile(path, "utf8"), readdir: (path: string) => readdir(path, { withFileTypes: true }) };
  const put = async (path: string, content: string) => { await mkdir(dirname(join(h.root, path)), { recursive: true }); await writeFile(join(h.root, path), content); };
  const commit = async () => {
    await h.exec("git", ["add", "-A"]); await h.exec("git", ["commit", "--allow-empty", "-m", "Save lifecycle fixture"]);
    return StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
  };
  await commit();
  for (const name of ["parked", "private", "disagree", "integrating"]) {
    await h.exec("git", ["checkout", "-b", `feat/${name}`]);
    await put(`.arc/active/meta-${name}.md`, makeMetaFixture(name, { state: name === "integrating" ? "Integrating" : "Active", branch: `feat/${name}`, cohort: "group", dependsOn: ["origin"], nextTask: "Selected branch progress", currentWorkflow: "integrate-work-unit" }));
    await commit(); await h.exec("git", ["checkout", "main"]);
  }
  const add = async (name: string, path: string, fields: MetaRenderOverrides = {}) => put(path, makeMetaFixture(name, {
    owner: "andrew", workClass: "Heavy", priority: "P1", taskList: `tasks-${name}.md`, design: [`spec-${name}.md`],
    currentWorkflow: "integrate-work-unit", lastCompleted: "Task 1.1", nextTask: "Held progress", blockers: "Needs input", nextAction: "Review", ...fields,
  }));
  await add("origin", ".arc/active/meta-origin.md", { branch: "main", dependsOn: ["completed", "private", "missing"] });
  await add("provisional", ".arc/backlog/provisional/group/provisional/meta-provisional.md", { state: "Planning", cohort: "group", workClass: "TBD" });
  await add("planned", ".arc/backlog/planned/group/planned/meta-planned.md", { state: "Planning", cohort: "group", branch: "plan/planned" });
  await add("completed", ".arc/completed/2026-q4/01_completed/meta-completed.md", { state: "Shipped", branch: "feat/completed", completed: "2026-10-02", prUrl: "https://example.test/pull/7" });
  await add("fallback", ".arc/completed/2026-q4/02_fallback/meta-fallback.md", { state: "Shipped", branch: null, completed: "2026-10-02" });
  await add("finalizing", ".arc/active/meta-finalizing.md", { state: "Integrating", branch: "feat/finalizing", currentWorkflow: "prepare-work-unit" });
  await put(".arc/backlog/planned/malformed-block/meta-malformed-block.md", makeMetaFixture("malformed-block", { state: "Planning" }).replace(/^---\n/mu, ""));
  await add("shared", ".arc/active/meta-shared.md", { branch: "main", dependsOn: ["origin"] });
  for (const name of ["parked", "disagree", "integrating"]) await put(`.arc/backlog/planned/group/${name}/meta-${name}.md`, makeMetaFixture(name, {
    state: name === "integrating" ? "Integrating" : "Active", branch: `feat/${name}`, cohort: "group", dependsOn: ["origin"],
    ...(name === "disagree" ? { owner: "different-owner" } : {}), nextTask: "Held pointer progress", currentWorkflow: "integrate-work-unit",
  }));
  const completedPath = ".arc/completed/2026-q4/01_completed/meta-completed.md";
  await put(completedPath, `${await fs.readFile(join(h.root, completedPath))}
## Completion Notes

Completed the intended change.

## Release Notes Entry

A reviewed change.

### Fixed

- Corrected lifecycle query handling.
`);
  const finalizingPath = ".arc/active/meta-finalizing.md";
  await put(finalizingPath, `${await fs.readFile(join(h.root, finalizingPath))}
## Completion Notes

Ready for integration.
`);
  const head = await commit();
  await h.exec("git", ["branch", "feat/finalizing", head]);
  const heldLegacy = await buildLifecycleIndex({ cwd: h.root, fs });
  const composedLegacy = await resolveComposedLifecycleIndex({ cwd: h.root, fs, oracle: { exec: h.exec, acquisitionPolicy: "local", baseBranch: "main" } });
  const held = entries(success(await listHeldLifecycleIndex(h.store)));
  const selected = entries(success(await listLifecycleIndex(h.store)));
  const get = (name: string, mode: "held" | "selected" = "held") => (mode === "held" ? held : selected).find((entry) => entry.reference.owner.name === name);
  const oldFields = async (name: string, mode: "held" | "selected" | "operational" = "held") => {
    const path = mode === "held" ? heldLegacy.get(name)?.path : mode === "operational" ? composedLegacy.recordsBySlug.get(name)?.writablePath : composedLegacy.recordsBySlug.get(name)?.selected.source.path;
    if (path === undefined) return undefined;
    const content = path.includes(":.arc/") ? (await h.exec("git", ["show", path])).stdout : await fs.readFile(isAbsolute(path) ? path : join(h.root, path));
    return parseMetaRecord(content);
  };
  const agreement = (name: string) => isLifecycleSelectedHere(h.store, { reference: metaReference(name) }).then(success);
  return { ...h, fs, put, commit, head, heldLegacy, composedLegacy, held, selected, get, oldFields, agreement };
}
