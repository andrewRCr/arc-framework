/** Logical lifecycle coordinates project through the shared store path providers. */
import { describe, expect, it } from "vitest";
import { workItemArtifactPath } from "../../../../src/lib/store/lifecycle-storage.js";
import { cohortDocumentPath, completedCohortPath } from "../../../../src/lib/store/lifecycle-record-path.js";
import { WorkUnitReadPlacementSchema } from "../../../../src/lib/store/placement.js";
import { StoreRecordSchema } from "../../../../src/lib/store/read.js";

describe("work-item artifact paths", () => {
  it.each([
    [{ kind: "active" }, null, ".arc/active"],
    [{ kind: "backlog", commitment: "planned" }, "group/leaf", ".arc/backlog/planned/group/leaf/demo"],
    [{ kind: "backlog", commitment: "provisional" }, null, ".arc/backlog/provisional/demo"],
    [{ kind: "completed", quarter: "2026-q4", sequence: "12" }, null, ".arc/completed/2026-q4/12_demo"],
  ])("projects meta and task list at %j", (placement, cohort, root) => {
    for (const artifact of ["meta", "tasks"] as const) expect(workItemArtifactPath("demo", artifact,
      WorkUnitReadPlacementSchema.parse(placement), cohort)).toBe(`${root}/${artifact}-demo.md`);
  });
});

const cohort = (parent: string | null, placement?: unknown) => StoreRecordSchema.parse({
  reference: { kind: "cohort/document", owner: { type: "cohort", name: "leaf" } }, content: "cohort", version: "v1", formatVersion: 1,
  conflicts: [], fields: { parent, purpose: "Purpose" }, ...(placement === undefined ? {} : { placement }),
});
it("projects planned cohorts from their own parent and name", () => {
  expect(cohortDocumentPath(cohort(null))).toBe(".arc/backlog/planned/leaf/cohort-leaf.md");
  expect(cohortDocumentPath(cohort("group"))).toBe(".arc/backlog/planned/group/leaf/cohort-leaf.md");
});
it("projects completed cohorts from their own archive quarter, sequence and closeout", () => {
  const record = cohort("group", { kind: "completed", quarter: "2027-q1", sequence: "03", closeout: "a" });
  expect(cohortDocumentPath(record)).toBe(".arc/completed/2027-q1/03a_cohort-leaf/cohort-leaf.md");
  expect(completedCohortPath(record)).toBe(cohortDocumentPath(record));
});
