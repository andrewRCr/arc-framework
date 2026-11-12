/** Ranked lookup ties prescribe repairs by holder kind and ranking tier. */
import { expect, it } from "vitest";
import { branchLinkRepair, clashRepair, type BranchLinkRepairCandidate } from "../../../../src/lib/store/clash-repair.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
const uidA = "11111111-1111-4111-8111-111111111111", uidB = "22222222-2222-4222-8222-222222222222";
const uidC = "33333333-3333-4333-8333-333333333333";
it("names each selected work branch's rename with its checkout prerequisite", () => {
  const candidates = [branchHolder("work-item/meta", "shared", uidA, ["refs/heads/custom/shared"]), branchHolder("work-item/meta", "shared", uidB, ["refs/heads/custom/shared"])];
  const repair = branchLinkRepair(candidates, { liveness: "live" }, branchInput("refs/heads/custom/shared"));
  expect(repair.text).toContain(`arc rename ${uidA} <new-slug>`);
  expect(repair.text).toContain(`arc rename ${uidB} <new-slug>`);
  expect(repair.text).toContain("`custom/shared` checked out in that holder's UID-bound checkout");
  expect(repair.argv).toEqual(["arc", "status", "--json"]);
});
it("names both moves in a work-unit and Errand branch tie", () => {
  const repair = branchLinkRepair([branchHolder("work-item/meta", "shared", uidA), branchHolder("work-item/record", "shared", uidB)], { liveness: "live" }, branchInput("feat/shared"));
  expect(repair.text).toContain(`arc rename ${uidA} <new-slug>`);
  expect(repair.text).toContain(`arc errand close ${uidB}`);
});
it("qualifies a captured former branch by prior work-unit rename and checkout", () => {
  const candidate = branchHolder("work-item/meta", "renamed", uidA, ["feat/shared", "feat/renamed"], ["shared"]);
  const repair = branchLinkRepair([candidate], { liveness: "live" }, branchInput("refs/heads/feat/shared"));
  expect(repair.text).toContain(`arc rename ${uidA} renamed`);
  expect(repair.text).toContain("only after a prior work-unit rename");
  expect(repair.text).toContain("`feat/shared` checked out in that holder's UID-bound checkout");
});
it("withholds ordinary rename for a retained current-name link", () => {
  const candidate = branchHolder("work-item/meta", "shared", uidA, ["chore/shared", "feat/shared"]);
  const repair = branchLinkRepair([candidate], { liveness: "live" }, branchInput("chore/shared"));
  expect(repair.text).toContain("No direct rename repair");
  expect(repair.text).toContain("ordinary rename selects `feat/shared` instead");
  expect(repair.text).not.toContain("arc rename");
});
it("withholds catch-up for a suffix absent from the holder's aliases", () => {
  const candidate = branchHolder("work-item/meta", "renamed", uidA, ["feat/shared", "feat/renamed"]);
  const repair = branchLinkRepair([candidate], { liveness: "live" }, branchInput("feat/shared"));
  expect(repair.text).toContain("No direct rename repair");
  expect(repair.text).not.toContain("arc rename");
});
it.each(["shared", "team/feat/renamed"])("states that rename cannot directly repair a non-work branch %s", branch => {
  const repair = branchLinkRepair([branchHolder("work-item/meta", "renamed", uidA, [branch])], { liveness: "live" }, branchInput(branch));
  expect(repair.text).toContain(`No direct rename repair for \`renamed\` (UID ${uidA})`);
  expect(repair.text).toContain(`\`${branch}\``);
  expect(repair.text).not.toContain("arc rename");
  expect(repair.argv).toEqual(["arc", "status", "--json"]);
});
it("withholds branch movement for a passive holder", () => {
  const candidate: BranchLinkRepairCandidate = { ...branchHolder("work-item/meta", "shared", uidA), placement: { kind: "backlog", commitment: "planned" } };
  const repair = branchLinkRepair([candidate], { liveness: "live" }, branchInput("feat/shared"));
  expect(repair.text).toContain("No direct rename repair");
  expect(repair.text).not.toContain("arc rename");
});
it("withholds movement when canonical links are ambiguous", () => {
  const candidate = branchHolder("work-item/meta", "shared", uidA, ["feat/shared", "refs/heads/feat/shared"]);
  const repair = branchLinkRepair([candidate], { liveness: "live" }, branchInput("feat/shared"));
  expect(repair.text).toContain("No direct rename repair");
  expect(repair.text).not.toContain("arc rename");
});
it("gives completed branch holders the completed repair", () => {
  const candidates = [uidA, uidB].map(uid => ({ ...branchHolder("work-item/record", "shared", uid),
    placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
  expect(branchLinkRepair(candidates, { liveness: "completed" }, branchInput("chore/shared")))
    .toEqual(clashRepair(candidates.map(({ reference }) => reference), { liveness: "completed" }));
});
function branchInput(ref: string) { return { kind: "ref" as const, repository: "project", ref }; }
function branchHolder(kind: "work-item/meta" | "work-item/record", name: string, uid: string,
  branches = [`feat/${name}`], aliases: string[] = []): BranchLinkRepairCandidate {
  return { reference: holder(kind, name, uid), placement: { kind: "active" }, aliases,
    links: { branches: branches.map(ref => ({ repository: "project", ref, linkedAs: "created", excluded: [] })) } };
}
function holder(kind: "work-item/meta" | "work-item/record" | "cohort/document", name: string, uid: string) {
  return recordReferences[kind](OwnerIdentitySchema.parse({ type: kind === "cohort/document" ? "cohort" : "work-item", name, uid }));
}
it("prefers renaming the cohort in a current-name clash", () => {
  const repair = clashRepair([holder("work-item/meta", "shared", uidA), holder("work-item/record", "shared", uidC), holder("cohort/document", "shared", uidB)], { liveness: "live", name: "current" });
  expect(repair.text).toContain(`arc rename ${uidB} <new-slug>`);
  expect(repair.text).toContain("cohort");
  expect(repair.text).not.toContain("arc errand close");
  expect(repair.argv).toEqual(["arc", "status", "--json"]);
});
it("closes the Errand by UID when no cohort holder is present", () => {
  const repair = clashRepair([holder("work-item/meta", "shared", uidA), holder("work-item/record", "shared", uidB)], { liveness: "live", name: "current" });
  expect(repair.text).toContain(`arc errand close ${uidB}`);
  expect(repair.argv).toEqual(["arc", "errand", "close", uidB]);
});
it("names either work unit's rename when both hold the current name", () => {
  const repair = clashRepair([holder("work-item/meta", "shared", uidA), holder("work-item/meta", "shared", uidB)], { liveness: "live", name: "current" });
  expect(repair.text).toContain(`arc rename ${uidA} <new-slug>`);
  expect(repair.text).toContain(`arc rename ${uidB} <new-slug>`);
  expect(repair.argv).toEqual(["arc", "status", "--json"]);
});
it("names each current name for a live former-name tie", () => {
  const repair = clashRepair([holder("work-item/meta", "alpha", uidA), holder("work-item/meta", "beta", uidB)], { liveness: "live", name: "former" });
  expect(repair.text).toContain("alpha"); expect(repair.text).toContain("beta");
  expect(repair.text).not.toMatch(/rename|close/iu);
  expect(repair.argv).toEqual(["arc", "status", "--json"]);
});
it("prints completed holders' UIDs without a lifecycle move", () => {
  const repair = clashRepair([holder("work-item/record", "shared", uidA), holder("work-item/record", "shared", uidB)], { liveness: "completed", name: "current" });
  expect(repair.text).toContain(uidA); expect(repair.text).toContain(uidB);
  expect(repair.text).not.toMatch(/arc rename|arc errand close/iu);
  expect(repair.argv).toEqual(["arc", "status", "--json"]);
});
