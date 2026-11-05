/** Human rename results retain executable recovery and personal branch evidence. */
import { afterEach, expect, it, vi } from "vitest";
import { reportRenameResult } from "../../../src/handlers/lifecycle-rename-report.js";
import { emptyRenameReport } from "../../../src/lib/work-unit/rename-report.js";
import { recordReferences, OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });
function capture(): string[] {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  return output;
}
it("prints a typed continuation and nonzero exit after the records have landed", () => {
  const output = capture();
  reportRenameResult("source", "target", { status: "partial", reason: "Origin unavailable.", report: emptyRenameReport(),
    remedy: { text: "Finish the remaining remote and personal workspace rename.", argv: ["arc", "rename", "source", "target"] } });
  expect(output.join("")).toContain("arc rename source target"); expect(process.exitCode).toBe(1);
  expect(output.join("")).not.toContain("Done.");
});

it.each(["renamed", "partial"] as const)("prints ordered reference edits and document-only heading repairs for %s", status => {
  const output = capture(), member = { type: "work-unit" as const, name: "member", uid: "12345678-abcd-4abc-8abc-123456789abc" };
  const parent = { type: "cohort" as const, name: "child", uid: "12345678-abcd-4abc-8abc-123456789def" };
  const document = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group", uid: parent.uid }));
  const report = { references: [
    { record: member, edits: [{ kind: "field" as const, field: "cohort" as const, from: "source/child", to: null }] },
    { record: parent, edits: [{ kind: "field" as const, field: "parent" as const, from: "source", to: "target" }] },
    { record: member, edits: [{ kind: "field" as const, field: "cohort" as const, from: null, to: "target/child" }] },
  ], memberHeadings: [{ document, line: 9, replacement: "### `target`" }], formerSlugTies: [], keptBranches: [] };
  reportRenameResult("source", "target", status === "renamed"
    ? { status, shape: "stub", pendingIntegration: false, advisories: [], report }
    : { status, reason: "Push unavailable", report, remedy: { text: "Retry", argv: ["arc", "rename", "source", "target"] } });
  const text = output.join("");
  expect(text).toContain(`work-unit member (${member.uid})`);
  expect(text).toContain(`cohort child (${parent.uid})`);
  const clear = text.indexOf('Cohort: "source/child" → [none]'), change = text.indexOf('Parent: "source" → "target"');
  expect(clear).toBeGreaterThanOrEqual(0); expect(change).toBeGreaterThan(clear);
  expect(text.indexOf('Cohort: [none] → "target/child"')).toBeGreaterThan(change);
  expect(text).toContain("cohort/document group"); expect(text).toContain("line 9: ### `target`");
  expect(text).not.toContain("arc rename group");
});
it("names every preserved link and the adopted remote branch", () => {
  const output = capture();
  reportRenameResult("source", "target", { status: "renamed", shape: "in-place", recordBatch: "applied", pendingIntegration: false,
    advisories: [], report: { ...emptyRenameReport(), keptBranches: [
      { branch: "errand/earlier", reason: "other-link" }, { branch: "personal/topic", reason: "other-link" },
      { branch: "feat/source", reason: "adopted" },
    ] }, remote: { status: "retained", oldBranch: "feat/source", newBranch: "feat/target", oldOid: "a".repeat(40) } });
  expect(output.join("")).toContain("errand/earlier"); expect(output.join("")).toContain("personal/topic");
  expect(output.join("")).toContain("Owner decision: delete it only if no longer needed.");
  expect(output.join("")).toContain("git push origin --delete 'feat/source'");
  expect(output.join("")).toContain("retained personal branch feat/source"); expect(output.join("")).not.toContain("unmanaged");
});

it("prints concrete command and text edits without inventing a heading command", () => {
  const output = capture(), uid = "12345678-abcd-4abc-8abc-123456789abc";
  const document = recordReferences["work-item/spec"](OwnerIdentitySchema.parse({ type: "work-item", name: "waiting", uid }));
  reportRenameResult("source", "target", { status: "renamed", shape: "stub", pendingIntegration: false, advisories: [],
    report: { ...emptyRenameReport(), references: [{ record: { type: "work-unit", name: "waiting", uid }, edits: [
      { kind: "command", argv: ["arc", "rename", uid, "target"] },
      { kind: "field", field: "dependsOn", from: "source", to: "target" },
      { kind: "text", document, line: 5, replacement: "Read `spec-target.md`." },
    ] }] } });
  const text = output.join("");
  expect(text).toContain(`arc rename ${uid} target`);
  expect(text).toContain('Depends On: "source" → "target"');
  expect(text).toContain("line 5: Read `spec-target.md`.");
});

it("distinguishes text repairs to two keyed companion documents of one owner", () => {
  const output = capture(), uid = "12345678-abcd-4abc-8abc-123456789abc";
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "waiting", uid });
  const documents = [recordReferences["work-item/companion"](owner, "research"), recordReferences["work-item/companion"](owner, "analysis")];
  reportRenameResult("source", "target", { status: "renamed", shape: "stub", pendingIntegration: false, advisories: [],
    report: { ...emptyRenameReport(), references: [{ record: { type: "work-unit", name: "waiting", uid }, edits:
      documents.map(document => ({ kind: "text", document, line: 5, replacement: "Read `spec-target.md`." })) }] } });
  const text = output.join("");
  expect(text).toContain('work-item/companion ["research"]');
  expect(text).toContain('work-item/companion ["analysis"]');
});

it("prints a former-slug repair and distinguishes retained branch reasons with catch-up", () => {
  const output = capture();
  reportRenameResult("source", "target", { status: "partial", reason: "Push unavailable", report: { ...emptyRenameReport(),
    formerSlugTies: [{ slug: "source", condition: "Two former holders", remedy: { text: "Name the intended holder by its current name." } }],
    keptBranches: [{ branch: "feat/source", reason: "another-holder", catchUp: { text: "Run on the holding machine", argv: ["arc", "rename", "current", "current"] } },
      { branch: "feat/earlier", reason: "continuation" }] } });
  const text = output.join("");
  expect(text).toContain("Former slug: source; Two former holders");
  expect(text).toContain("Name the intended holder by its current name.");
  expect(text).toContain("kept feat/source; another holder links it");
  expect(text).toContain("arc rename current current");
  expect(text).toContain("kept feat/earlier; rename continuation");
  expect(text).not.toContain("--delete"); expect(process.exitCode).toBe(1);
});
