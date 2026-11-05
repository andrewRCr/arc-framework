/** Decomposition copy reports resolve to verbatim companion records. */
import { describe, expect, it } from "vitest";
import { nativeDecomposeFixture } from "../helpers/store/ref-decompose.js";
import { success } from "../helpers/store/suite-tools.js";
import { completeCutMapFixture } from "../fixtures/decompose-v4.js";
import { prepareDecomposePreflight } from "../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../src/lib/decompose/additive.js";
import { recordReferences } from "../../src/lib/store/index.js";
import { readLifecycleMetaFields } from "../../src/lib/store/lifecycle-write.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

describe.each(["default", "separate"] as const)("verbatim decomposition copies in %s", layout => {
  it("names the stored optional companion in the copy report", async () => {
    const h = await nativeDecomposeFixture(layout);
    const key = "design/notes-origin.md";
    await h.seed(recordReferences["work-item/companion"](h.primary.reference.owner, key),
      "# origin notes\n\n## Scope\n\nOwned work.\n");
    const prepared = await prepareDecomposePreflight(h.ctx, "origin");
    if (prepared.status === "refused") throw new Error(JSON.stringify(prepared));
    const map = completeCutMapFixture(prepared.result.machine);
    for (const allocation of map.authoring.sourceAllocations) {
      const unit = map.machine.sourceUnits.find(source => source.sourceId === allocation.sourceId);
      if (unit && allocation.disposition.kind === "target")
        allocation.disposition.targetLocator.artifact = unit.sourceLocator.artifact.replace("origin", "member-a");
    }
    const applied = await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" });
    if (applied.status === "refused") throw new Error(JSON.stringify(applied));
    expect(applied.result.report.members).toHaveLength(2);
    for (const member of applied.result.report.members) {
      const primary = success(await h.store.read({ reference: member.meta }));
      expect(success(readLifecycleMetaFields(primary)).design).toEqual([`draft-${member.slug}.md`]);
    }
    const member = applied.result.report.members.find(candidate => candidate.slug === "member-a");
    expect(member?.copies).toHaveLength(2);
    const copy = member?.copies.find(candidate => candidate.reference.kind === "work-item/companion");
    if (!copy) throw new Error("The allocated member must report its companion copy");
    const record = success(await h.store.read({ reference: copy.reference }));
    expect(record.content).toBe("# member-a notes\n\n## Scope\n\nOwned work.\n");
    const home = expandStoredPath(record.reference, { placement: record.placement });
    expect(copy.basename).toBe(key);
    expect(`${home.root}${copy.basename}`).toBe(home.path);
    expect(new TextDecoder().decode((await h.ports.rawExec([...h.gitDir ? [`--git-dir=${h.gitDir}`] : [],
      "show", `${home.ref}:${home.root}${copy.basename}`], { cwd: h.root })).stdout)).toBe(record.content);
  }, 30_000);
});
