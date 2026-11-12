/** The capability flip admits every target spelling the capture gate reads. */
import { expect, it } from "vitest";
import { planUserReferenceReconcile } from "../../src/lib/user-reference-reconcile.js";

it.each(['- WU_Target: origin (planned)', '- `WU_Target: origin (planned)`', '- _WU_Target:_ `origin (planned)`'])("rewrites a former slug through the entry grammar: %s", (line) => {
  const result = planUserReferenceReconcile({
    stateOffBranch: true,
    transitions: [{ subject: "origin", outcome: { kind: "rename", targetSlug: "successor" } }],
    userInbox: { path: "inbox.md", content: `## Work Unit\n### **Title**\n${line}\n` },
  });
  expect(result.edits[0]?.content).toContain(line.replace("origin", "successor"));
});
