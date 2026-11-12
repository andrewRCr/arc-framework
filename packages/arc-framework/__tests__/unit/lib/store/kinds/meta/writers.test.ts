/** Shared anchor refusal and creation-input contracts for metadata writers. */

import { describe, expect, it } from "vitest";
import { makeMetaFixture } from "../../../../../helpers/meta-fixture.js";
import { renderMetaFile, type MetaRenderOverrides } from "../../../../../../src/lib/active/meta-reader.js";
import { MetaCandidateIdSchema } from "../../../../../../src/lib/active/meta-schema.js";
import { SlugSchema } from "../../../../../../src/lib/kernel/schema/slug.js";
import { StateVersionSchema } from "../../../../../../src/lib/store/identity.js";
import * as writers from "../../../../../../src/lib/store/kinds/meta/writers.js";

const original = makeMetaFixture("sample");
const values = [
  { label: "State", run: (content: string) => writers.writeMetaState(content, "Planning") },
  { label: "Owner", run: (content: string) => writers.writeMetaOwner(content, SlugSchema.parse("next-owner")) },
  { label: "Branch", run: (content: string) => writers.writeMetaBranch(content, "plan/next") },
  { label: "Class", run: (content: string) => writers.writeMetaClass(content, "Heavy") },
  { label: "Priority", run: (content: string) => writers.writeMetaPriority(content, "P1") },
  { label: "Cohort", run: (content: string) => writers.writeMetaCohort(content, "next-value") },
  { label: "Depends On", run: (content: string) => writers.writeMetaDependsOn(content, ["next-one", "next-two"]) },
  { label: "Origin", run: (content: string) => writers.writeMetaOrigin(content, "next-value") },
  { label: "Design", run: (content: string) => writers.writeMetaDesign(content, ["next-one", "next-two"]) },
  { label: "Task List", run: (content: string) => writers.writeMetaTaskList(content, "next-value") },
  { label: "Review Rubric", run: (content: string) => writers.writeMetaReviewRubric(content, "next-value") },
  { label: "Promotion Receipt", run: (content: string) => writers.writeMetaPromotionReceipt(content, `errand-v1/repair/${"a".repeat(32)}`) },
  { label: "Candidate", run: (content: string) => writers.writeMetaCandidate(content, MetaCandidateIdSchema.parse(`sha256:${"a".repeat(64)}`)) },
  { label: "Current Workflow", run: (content: string) => writers.writeMetaCurrentWorkflow(content, "next-value") },
  { label: "Last Completed", run: (content: string) => writers.writeMetaLastCompleted(content, "next-value") },
  { label: "Next Task", run: (content: string) => writers.writeMetaNextTask(content, "next-value") },
  { label: "Blockers", run: (content: string) => writers.writeMetaBlockers(content, "next-value") },
  { label: "Next Action", run: (content: string) => writers.writeMetaNextAction(content, "next-value") },
  { label: "State at Handoff", run: (content: string) => writers.writeMetaStateAtHandoff(content, StateVersionSchema.parse("next-state")) },
  { label: "Commit at Handoff", run: (content: string) => writers.writeMetaCommitAtHandoff(content, "next-value") },
  { label: "Session Type", run: (content: string) => writers.writeMetaSessionType(content, "planning") },
  { label: "PR URL", run: (content: string) => writers.writeMetaPrUrl(content, "next-value") },
  { label: "Completed", run: (content: string) => writers.writeMetaCompleted(content, "next-value") },
  { label: "Session Context", run: (content: string) => writers.writeMetaSessionContext(content, "Next context") },
  { label: "Title", run: (content: string) => writers.writeMetaTitle(content, SlugSchema.parse("next-name")) },
];

describe("meta writer boundaries", () => {
  it("changes only the title line", () => {
    expect(writers.writeMetaTitle(original, SlugSchema.parse("next-name"))).toBe(
      original.replace("# Metadata: sample", "# Metadata: next-name"));
  });

  it.each(values)("refuses $label writes without the H1", ({ run }) => {
    expect(() => run(original.replace(/^# [^\n]*\n/u, ""))).toThrow(/missing H1.*anchor/iu);
  });

  it.each(values)("refuses $label writes without the closing rule", ({ run }) => {
    expect(() => run(original.replace(/\n---\n/u, "\n"))).toThrow(/missing closing.*anchor/iu);
  });

  it("reports the anchor error before an absent field or an invalid section body", () => {
    const content = original.replace(/\n---\n/u, "\n").replace(/^- \*\*Cohort:\*\*[^\n]*\n/mu, "");
    expect(() => writers.writeMetaCohort(content, "next-cohort")).toThrow(/missing closing.*anchor/iu);
    expect(() => writers.writeMetaSessionContext(content, "## Other")).toThrow(/missing closing.*anchor/iu);
  });

  it("excludes section bodies from creation inputs", () => {
    const input: MetaRenderOverrides = { state: "Active", owner: "owner" };
    // @ts-expect-error Session Context is edited through its own writer.
    input.sessionContext = "Context";
    // @ts-expect-error Completion Notes belong to the completion writer.
    input.completionNotes = ["Complete"];
    // @ts-expect-error Release Notes Entry belongs to the release writer.
    input.releaseNotesEntry = ["Release"];
    expect(renderMetaFile("sample", { state: "Active", owner: "owner" })).not.toContain("## ");
  });
});
