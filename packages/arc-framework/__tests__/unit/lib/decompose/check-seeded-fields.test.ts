/** Seeded member fields retain their decisions through authoring and dependency reconciliation. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn, writeMetaCohort, writeMetaPriority } from "../../../../src/lib/store/kinds/meta/writers.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { checkDecomposeSeededFields } from "../../../../src/lib/decompose/check-seeded-fields.js";
import type { DecomposeContext } from "../../../../src/lib/decompose/context.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";

async function check(ctx: DecomposeContext) {
  const acquired = await acquireDecomposeTerminal(ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  return checkDecomposeSeededFields(ctx, acquired.result);
}

it("refuses a dropped seeded dependency and passes after it is restored through write-back", async () => {
  const h = await createDecomposeTerminalFixture();
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const edited = await h.handEdit(primary, writeMetaDependsOn(primary.content, []));
  const before = lifecycleSuccess(await h.store.version());
  const result = await check(h.ctx);
  expect(result).toMatchObject({ status: "refused", reason: "seed-divergence", locus: "member-a.Depends On" });
  expect(result.status === "refused" && result.remedy.text).toMatch(/write-back.*--revise/u);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await h.handEdit(edited, writeMetaDependsOn(edited.content, ["member-b"]));
  expect((await check(h.ctx)).status).toBe("ok");
});

it("compares a renamed seeded provider by owner after the production reference sweep", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true });
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main" },
    { sourceSlug: "provider", targetSlug: "foundation" })).toMatchObject({ status: "renamed" });
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  expect(member.fields).toMatchObject({ dependsOn: ["foundation"] });
  expect((await check(h.ctx)).status).toBe("ok");
});

it.each([false, true])("requires removing a retirement member's origin edge through write-back, alias=%s", async alias => {
  const h = await createDecomposeTerminalFixture();
  if (alias) {
    const context = { store: h.store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main" };
    expect(await runStoreRename(context, { sourceSlug: "origin", targetSlug: "current-source" })).toMatchObject({ status: "renamed" });
    expect(await runStoreRename(context, { sourceSlug: "current-source", targetSlug: "origin" })).toMatchObject({ status: "renamed" });
  }
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const edited = await h.handEdit(member, writeMetaDependsOn(member.content, ["member-b", alias ? "current-source" : "origin"]));
  const result = await check(h.ctx);
  expect(result).toMatchObject({ status: "refused", reason: "member-depends-on-origin", locus: "member-a.Depends On" });
  expect(result.status === "refused" && result.remedy.text).toMatch(/remove.*origin.*write-back/iu);
  await h.handEdit(edited, writeMetaDependsOn(edited.content, ["member-b"]));
  expect((await check(h.ctx)).status).toBe("ok");
});

it.each(["extra-provider", "priority"] as const)("accepts member grooming: %s", async change => {
  const h = await createDecomposeTerminalFixture();
  const extra = await h.seedStub("extra");
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  await h.handEdit(member, change === "extra-provider"
    ? writeMetaDependsOn(member.content, ["extra", "member-b"]) : writeMetaPriority(member.content, "P1"));
  const before = lifecycleSuccess(await h.store.version());
  const result = await check(h.ctx);
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  if (change === "extra-provider") expect(result.result.observations).toContainEqual(extra);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("preserves an operational provider-read failure and proceeds after its repair", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true });
  const read = h.store.read.bind(h.store);
  const refusal: StoreRefusal = { code: "namespace-corrupt", class: "terminal", namespace: "work",
    condition: "Provider authority could not be read.", remedy: { text: "Restore the provider namespace authority." } };
  h.store.read = async input => input.reference.owner.name === "provider" ? { status: "refused", refusal } : read(input);
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "store", class: "terminal", storeRefusal: refusal, remedy: refusal.remedy });
  h.store.read = read;
  expect((await check(h.ctx)).status).toBe("ok");
});

it("accepts an extraction member's seeded edge to the surviving origin", async () => {
  const h = await createDecomposeTerminalFixture({ started: true, extraction: true,
    authorMap: map => { map.authoring.externalEdges = [{ from: "member-a", to: "origin" }]; } });
  expect((await check(h.ctx)).status).toBe("ok");
});

it("requires revision for a gone member while leaving its replacement generation untouched", async () => {
  const h = await createDecomposeTerminalFixture();
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")));
  const replacement = await h.seedStub("member-a");
  const before = lifecycleSuccess(await h.store.version());
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "member-gone",
    remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: replacement.reference }))).toEqual(replacement);
});

it("names the reverse rename for a member and passes after the production rename restores it", async () => {
  const h = await createDecomposeTerminalFixture();
  const rename = (sourceSlug: string, targetSlug: string) => runStoreRename({ store: h.store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main" }, { sourceSlug, targetSlug });
  expect(await rename("member-b", "current-member")).toMatchObject({ status: "renamed" });
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "member-renamed",
    remedy: { argv: ["arc", "rename", "current-member", "member-b"] } });
  expect(await rename("current-member", "member-b")).toMatchObject({ status: "renamed" });
  expect((await check(h.ctx)).status).toBe("ok");
});

it.each([
  ["other-group", "group", false], ["other-group", "third-group", false],
  [null, null, false], ["other-group", "other-group", true],
] as const)("allows a Cohort revision only for a common admissible placement: %s / %s", async (first, second, revisable) => {
  const h = await createDecomposeTerminalFixture();
  await h.seedCohort("other-group");
  await h.seedCohort("third-group");
  for (const [slug, cohort] of [["member-a", first], ["member-b", second]] as const) {
    const member = lifecycleSuccess(await readWorkUnit(h.store, slug));
    await h.handEdit(member, writeMetaCohort(member.content, cohort));
  }
  const result = await check(h.ctx);
  expect(result).toMatchObject({ status: "refused", reason: "seed-divergence", locus: "member-a.Cohort" });
  if (result.status !== "refused") throw new Error("Expected Cohort divergence.");
  expect(result.remedy.text).toContain("write-back");
  expect(result.remedy.text.includes("--revise")).toBe(revisable);
  for (const slug of ["member-a", "member-b"]) {
    const member = lifecycleSuccess(await readWorkUnit(h.store, slug));
    await h.handEdit(member, writeMetaCohort(member.content, "group"));
  }
  expect((await check(h.ctx)).status).toBe("ok");
});

it("requires restoring a sole retirement member's empty Cohort, with no placement revision offered", async () => {
  const h = await createDecomposeTerminalFixture({ withHome: true, authorMap: map => {
    map.authoring.placement = { kind: "direct-member" };
    map.authoring.destinations.splice(1, 1);
    map.authoring.internalEdges = [];
  } });
  await h.seedCohort("other-group");
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const edited = await h.handEdit(member, writeMetaCohort(member.content, "other-group"));
  const result = await check(h.ctx);
  expect(result).toMatchObject({ status: "refused", reason: "seed-divergence", locus: "member-a.Cohort" });
  if (result.status !== "refused") throw new Error("Expected Cohort divergence.");
  expect(result.remedy.text).not.toContain("--revise");
  await h.handEdit(edited, writeMetaCohort(edited.content, null));
  expect((await check(h.ctx)).status).toBe("ok");
});
