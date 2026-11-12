/** Canonical bullet edits preserve all other field and section bytes. */

import { describe, expect, it } from "vitest";
import { makeMetaFixture } from "../../../../../helpers/meta-fixture.js";
import { parseMetaRecord } from "../../../../../../src/lib/active/meta-reader.js";
import { MetaCandidateIdSchema } from "../../../../../../src/lib/active/meta-schema.js";
import { StateVersionSchema } from "../../../../../../src/lib/store/identity.js";
import { META_BULLET_WRAP_COLUMN } from "../../../../../../src/lib/store/kinds/meta/projection.js";
import {
  writeMetaCohort,
  writeMetaDependsOn,
  writeMetaOrigin,
  writeMetaDesign,
  writeMetaTaskList,
  writeMetaReviewRubric,
  writeMetaPromotionReceipt,
  writeMetaCandidate,
  writeMetaCurrentWorkflow,
  writeMetaLastCompleted,
  writeMetaNextTask,
  writeMetaBlockers,
  writeMetaNextAction,
  writeMetaStateAtHandoff,
  writeMetaCommitAtHandoff,
  writeMetaSessionType,
  writeMetaPrUrl,
  writeMetaCompleted,
} from "../../../../../../src/lib/store/kinds/meta/bullet-writers.js";

const receipt = `errand-v1/repair/${"a".repeat(32)}`;
const candidate = MetaCandidateIdSchema.parse(`sha256:${"b".repeat(64)}`);
const anchor = StateVersionSchema.parse("next-state");
const original = makeMetaFixture("sample", {
  cohort: "old-cohort", dependsOn: ["old-dependency"], origin: "old-origin", design: ["spec-old.md"],
  taskList: "tasks-old.md", reviewRubric: "old-rubric", candidateId: MetaCandidateIdSchema.parse(`sha256:${"c".repeat(64)}`),
  currentWorkflow: "old-workflow", lastCompleted: "Old completed task", nextTask: "Old task directive",
  blockers: "Old blocker", nextAction: "Old action\nwith an authored continuation", prUrl: "https://example.com/old",
  completed: "2026-10-11", stateAtHandoff: StateVersionSchema.parse("old-state"), commitAtHandoff: "old-commit",
  sessionType: "execution",
}).replace("\n---", "\n## Session Context\n\nKeep `authored` prose.\n\n## Completion Notes\n\nKeep this too.\n\n---")
  + "\n## Release Notes Entry\n\nKeep outside the field block.\n";

function outsideField(content: string, label: string): string {
  return content.replace(new RegExp(`^- \\*\\*${label}:\\*\\*[^\\n]*(?:\\n[ \\t]+[^\\n]+)*\\n`, "mu"), "");
}

const cases = [
  { key: "cohort", label: "Cohort", expected: "next-cohort", rendered: "`next-cohort`",
    run: (content: string) => writeMetaCohort(content, "next-cohort") },
  { key: "dependsOn", label: "Depends On", expected: ["next-one", "next-two"], rendered: "`next-one`, `next-two`",
    run: (content: string) => writeMetaDependsOn(content, ["next-one", "next-two"]) },
  { key: "origin", label: "Origin", expected: "internal", rendered: "[internal]",
    run: (content: string) => writeMetaOrigin(content, "internal") },
  { key: "design", label: "Design", expected: ["spec-next.md", "spec-layer.md"], rendered: "`spec-next.md`, `spec-layer.md`",
    run: (content: string) => writeMetaDesign(content, ["spec-next.md", "spec-layer.md"]) },
  { key: "taskList", label: "Task List", expected: "tasks-next.md", rendered: "`tasks-next.md`",
    run: (content: string) => writeMetaTaskList(content, "tasks-next.md") },
  { key: "reviewRubric", label: "Review Rubric", expected: "next-rubric", rendered: "`next-rubric`",
    run: (content: string) => writeMetaReviewRubric(content, "next-rubric") },
  { key: "promotionReceipt", label: "Promotion Receipt", expected: receipt, rendered: `\`${receipt}\``,
    run: (content: string) => writeMetaPromotionReceipt(content, receipt) },
  { key: "candidateId", label: "Candidate", expected: candidate, rendered: `\`${candidate}\``,
    run: (content: string) => writeMetaCandidate(content, candidate) },
  { key: "currentWorkflow", label: "Current Workflow", expected: "next-workflow", rendered: "`next-workflow`",
    run: (content: string) => writeMetaCurrentWorkflow(content, "next-workflow") },
  { key: "lastCompleted", label: "Last Completed", expected: "Next completed task", rendered: "Next completed task",
    run: (content: string) => writeMetaLastCompleted(content, "Next completed task") },
  { key: "nextTask", label: "Next Task", expected: "Next task directive", rendered: "Next task directive",
    run: (content: string) => writeMetaNextTask(content, "Next task directive") },
  { key: "blockers", label: "Blockers", expected: "Next blocker", rendered: "Next blocker",
    run: (content: string) => writeMetaBlockers(content, "Next blocker") },
  { key: "nextAction", label: "Next Action", expected: "Next action", rendered: "Next action",
    run: (content: string) => writeMetaNextAction(content, "Next action") },
  { key: "stateAtHandoff", label: "State at Handoff", expected: anchor, rendered: "`next-state`",
    run: (content: string) => writeMetaStateAtHandoff(content, anchor) },
  { key: "commitAtHandoff", label: "Commit at Handoff", expected: "next-commit", rendered: "`next-commit`",
    run: (content: string) => writeMetaCommitAtHandoff(content, "next-commit") },
  { key: "sessionType", label: "Session Type", expected: "planning", rendered: "`Planning`",
    run: (content: string) => writeMetaSessionType(content, "planning") },
  { key: "prUrl", label: "PR URL", expected: "https://example.com/next", rendered: "<https://example.com/next>",
    run: (content: string) => writeMetaPrUrl(content, "https://example.com/next") },
  { key: "completed", label: "Completed", expected: "2026-10-12", rendered: "2026-10-12",
    run: (content: string) => writeMetaCompleted(content, "2026-10-12") },
 ] as const;

describe("meta bullet writers", () => {
  it.each(cases)("writes $label canonically and preserves every other byte", ({ key, label, expected, rendered, run }) => {
    const result = run(original);
    expect(parseMetaRecord(result)[key]).toEqual(expected);
    expect(result).toContain(`- **${label}:** ${rendered}`);
    expect(outsideField(result, label)).toBe(outsideField(original, label));
  });

  it("inserts a missing bullet at its field-order position", () => {
    const content = outsideField(original, "Cohort");
    const result = writeMetaCohort(content, "next-cohort");
    expect(result).toContain("- **Cohort:** `next-cohort`\n- **Depends On:** `old-dependency`");
    expect(outsideField(result, "Cohort")).toBe(content);
  });

  it("renders null narrative values with the field's unset sentinel", () => {
    const result = writeMetaNextAction(original, null);
    expect(result).toContain("- **Next Action:** —");
    expect(parseMetaRecord(result).nextAction).toBeNull();
    expect(outsideField(result, "Next Action")).toBe(outsideField(original, "Next Action"));
    expect(writeMetaTaskList(original, null)).toContain("- **Task List:** [none]");
  });

  it("removes omitted-when-absent bullets on null", () => {
    const result = writeMetaSessionType(writeMetaCommitAtHandoff(writeMetaStateAtHandoff(
      writeMetaCandidate(original, null), null), null), null);
    for (const label of ["Candidate", "State at Handoff", "Commit at Handoff", "Session Type"]) {
      expect(result).not.toContain(`**${label}:**`);
    }
    expect(parseMetaRecord(result)).toMatchObject({ candidateId: null, stateAtHandoff: null,
      commitAtHandoff: null, sessionType: null });
  });

  it.each([writeMetaDependsOn, writeMetaDesign])("wraps long identifier lists on item boundaries", (write) => {
    const values = ["a".repeat(70), "b".repeat(70), "c".repeat(70)];
    const result = write(original, values);
    const record = parseMetaRecord(result);
    expect(write === writeMetaDesign ? record.design : record.dependsOn).toEqual(values);
    const label = write === writeMetaDesign ? "Design" : "Depends On";
    const field = result.match(new RegExp(`^- \\*\\*${label}:\\*\\*[^\\n]*(?:\\n[ \\t]+[^\\n]+)*`, "mu"))?.[0];
    expect(field).toContain("\n  ");
    for (const line of field?.split("\n") ?? []) expect(line.length).toBeLessThanOrEqual(META_BULLET_WRAP_COLUMN);
    expect(outsideField(result, label)).toBe(outsideField(original, label));
  });
  it("refuses to change or remove a present promotion receipt", () => {
    const content = makeMetaFixture("sample", { promotionReceipt: receipt });
    expect(() => writeMetaPromotionReceipt(content, `errand-v1/repair/${"b".repeat(32)}`)).toThrow(/immutable/iu);
    expect(() => writeMetaPromotionReceipt(content, null)).toThrow(/immutable/iu);
    expect(writeMetaPromotionReceipt(content, receipt)).toBe(content);
  });

  it("preserves a quoted marker prefix when replacing its value", () => {
    const content = original.replace("- **Next Action:**", "> - **Next Action:**");
    expect(writeMetaNextAction(content, "Next action")).toBe(content.replace(
      "> - **Next Action:** Old action\n  with an authored continuation", "> - **Next Action:** Next action"));
  });

  it("preserves CRLF endings when replacing a bullet", () => {
    const content = original.replace(/\n/gu, "\r\n");
    const result = writeMetaNextAction(content, "Next action");
    expect(parseMetaRecord(result).nextAction).toBe("Next action");
    expect(result.replace(/\r\n/gu, "")).not.toContain("\n");
    expect(outsideField(result, "Next Action")).toBe(outsideField(content, "Next Action"));
  });

  it("inserts an absent field without treating a section's marker as that field", () => {
    const content = outsideField(original, "Cohort").replace("Keep `authored` prose.",
      "Keep `authored` prose.\n\n- **Cohort:** Authored section prose.");
    const result = writeMetaCohort(content, "next-cohort");
    expect(parseMetaRecord(result).cohort).toBe("next-cohort");
    expect(outsideField(result, "Cohort")).toBe(content);
  });

  it("sets an absent receipt without claiming a marker in section prose", () => {
    const content = original.replace("Keep `authored` prose.",
      "Keep `authored` prose.\n\n- **Promotion Receipt:** Authored section prose.");
    const result = writeMetaPromotionReceipt(content, receipt);
    expect(parseMetaRecord(result).promotionReceipt).toBe(receipt);
    expect(outsideField(result, "Promotion Receipt")).toBe(content);
  });

});
