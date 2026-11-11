/** Cohort deltas and a member's changed membership refresh canonical and current copies. */
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { cohortDoc } from "../../../helpers/store/cohort-rule-input.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { runCohortRename } from "../../../../src/lib/store/cohort-rename.js";
import { RecordReferenceSchema, OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";

import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";

import { plantRefPrimary } from "../../../helpers/store/ref-primary-plant.js";
import { runCohortClose, runCohortRemove } from "../../../../src/commands/cohort.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });
const metadata = (cohort?: string) => makeMetaFixture("alpha", { state: "Active", currentWorkflow: "process-task-loop",
  workClass: "Light", priority: "P1", owner: "andrew", ...(cohort === undefined ? {} : { cohort }) });

async function fixture() {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(h.f.root);
  const cohort = await seed(h.f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })), cohortDoc().content);
  success(await h.f.store.write(update(h.f, h.primary, metadata("group"))));
  const primary = success(await h.f.store.read({ reference: h.primary.reference }));
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection({ checkout: h.f.root, store: h.f.store });
  await endProjection({ checkout: h.f.root, store: h.f.store });
  return { ...h, primary, cohort, canonical: ".arc/backlog/planned/group/cohort-group.md", copy: ".arc/active/current/cohort-group.md" };
}

it("removes a current cohort copy when its member leaves the cohort", async () => {
  const h = await fixture();
  expect(parseStampedFile(await readFile(join(h.f.root, h.copy), "utf8")).content).toBe(h.cohort.content);
  const before = await stat(join(h.f.root, h.canonical), { bigint: true });
  success(await h.f.store.write(update(h.f, h.primary, metadata())));
  expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
  await expect(readFile(join(h.f.root, h.copy))).rejects.toMatchObject({ code: "ENOENT" });
  const after = await stat(join(h.f.root, h.canonical), { bigint: true });
  expect({ ino: after.ino, mtimeNs: after.mtimeNs }).toEqual({ ino: before.ino, mtimeNs: before.mtimeNs });
});

it("projects a cohort rename's own document, child, members, and current copies", async () => {
  const h = await fixture();
  await seed(h.f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "child" })), cohortDoc("child", "group").content);
  const member = await seed(h.f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "member" } }),
    makeMetaFixture("member", { state: "Planning", currentWorkflow: "draft-design", owner: "andrew", cohort: "group/child", workClass: "Light", priority: "P1" }),
    { kind: "backlog", commitment: "planned" });
  await startProjection({ checkout: h.f.root, store: h.f.store });
  await endProjection({ checkout: h.f.root, store: h.f.store });
  expect(await runCohortRename(h.f.store, h.cohort, { operand: "group", targetSlug: "root" })).toMatchObject({ status: "renamed" });
  expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
  for (const path of [h.canonical, h.copy, ".arc/backlog/planned/group/child/cohort-child.md", ".arc/backlog/planned/group/child/member/meta-member.md"]) {
    await expect(readFile(join(h.f.root, path), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  }
  for (const path of [".arc/backlog/planned/root/cohort-root.md", ".arc/active/current/cohort-root.md",
    ".arc/backlog/planned/root/child/cohort-child.md", ".arc/backlog/planned/root/child/member/meta-member.md"]) {
    expect(parseStampedFile(await readFile(join(h.f.root, path), "utf8")).content).toContain("root");
  }
  expect(success(await h.f.store.read({ reference: member.reference })).content).toContain("root/child");
});

it("preserves a member's current copy while its cohort name is ambiguous", async () => {
  const h = await fixture();
  const before = await readFile(join(h.f.root, h.copy), "utf8");
  success(await h.f.store.write(update(h.f, h.cohort, h.cohort.content.replace("Coordinate the work.", "Changed while ambiguous."))));
  await plantRefPrimary(h.f, { kind: "cohort/document", name: "group", uid: "00000000-0000-4000-8000-000000000099", content: cohortDoc().content });
  expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
  expect(await readFile(join(h.f.root, h.copy), "utf8")).toBe(before);
  expect(projectionProcessState().diagnostics.some(each => each.mark.reason === "More than one captured owner holds this name.")).toBe(true);
});

for (const operation of ["close", "remove"] as const) {
  it(`refreshes a cohort's canonical file after its ${operation}`, async () => {
    const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
    directories.push(h.f.root);
    const cohort = await seed(h.f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })), cohortDoc().content);
    const command = { checkout: h.f.root, store: h.f.store };
    await rm(join(h.projected.location.stateDir, "index"));
    await startProjection(command);
    await endProjection(command);
    const path = ".arc/backlog/planned/group/cohort-group.md";
    expect(parseStampedFile(await readFile(join(h.f.root, path), "utf8")).content).toBe(cohort.content);
    const input = { operand: "group", confirmed: true };
    expect(operation === "close" ? await runCohortClose(h.f.store, input, () => new Date(2026, 10, 1))
      : await runCohortRemove(h.f.store, input)).toMatchObject({ status: operation === "close" ? "closed" : "removed" });
    await startProjection(command);
    await endProjection(command);
    await expect(readFile(join(h.f.root, path), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    if (operation === "close") expect(parseStampedFile(await readFile(join(h.f.root,
      ".arc/completed/2026-q4/01a_cohort-group/cohort-group.md"), "utf8")).content).toBe(cohort.content);
  });
}
