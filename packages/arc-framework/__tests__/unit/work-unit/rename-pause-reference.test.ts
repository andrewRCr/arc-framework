/** An in-flight pause retains its dependency's former slug during rename settling. */
import { expect, it } from "vitest";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { planRenameReferences, applyRenameReferencePlan } from "../../../src/lib/work-unit/rename-reference-sweep.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
it("leaves the pause waits-on unchanged while settling an artifact reference", async () => {
  const path = ".arc/active/meta-dependent.md";
  let content = makeMetaFixture("dependent").replace("---\n", "## Pause\n\n- **Paused By:** `andrew`\n- **Since:** `2026-10-13T12:00:00Z`\n- **Reason:** Waiting.\n- **Waits On:** `original`\n\n---\n") + "\n## Notes\n\n`spec-original.md`\n";
  const context = { listFiles: async () => ["active/meta-dependent.md"], readFile: async () => content,
    writeFile: async (_path: string, bytes: string) => { content = bytes; } };
  const plan = await planRenameReferences({ arcRoot: ".arc", sourceSlug: "original", targetSlug: "renamed" }, context);
  expect(plan.changedPaths).toEqual([path]);
  await applyRenameReferencePlan(plan, context);
  expect(parseMetaRecord(content).pause?.waitsOn).toEqual({ kind: "work-unit", slug: "original" });
  expect(content).toContain("spec-renamed.md");
});
