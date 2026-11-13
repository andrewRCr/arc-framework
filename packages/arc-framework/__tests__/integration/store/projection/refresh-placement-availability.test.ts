/** Partial placement evidence cannot erase current cohort copies or visible owners. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { cohortDoc } from "../../../helpers/store/cohort-rule-input.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences, RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { createExecaGitExec } from "../../../../src/lib/git/process-executor.js";

const directories: string[] = [];
const AVAILABILITY_TIMEOUT_MS = 120_000;
const copy = ".arc/active/current/cohort-group.md";
const peerPath = ".arc/active/in-flight/beta/meta-beta.md";
const personalPath = ".arc/user/andrew/scratch/independent.md";
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function fixture(ownLayout: "nested" | "flat" = "nested") {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout });
  directories.push(h.f.root);
  const cohort = await seed(h.f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })), cohortDoc().content);
  success(await h.f.store.write(update(h.f, h.primary, makeMetaFixture("alpha", { state: "Active", owner: "andrew",
    workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop", cohort: "group" }))));
  const primary = success(await h.f.store.read({ reference: h.primary.reference }));
  const peer = await seed(h.f, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "beta" })),
    makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
      currentWorkflow: "process-task-loop", nextAction: "Initial peer action" }), { kind: "active" });
  const personal = await seed(h.f, RecordReferenceSchema.parse({ kind: "personal/document",
    owner: { type: "person", name: "andrew" }, key: "scratch/independent.md" }), "Independent base.\n");
  const exec = createExecaGitExec();
  await exec("git", ["config", "arc.inflightView", "all"], { cwd: h.f.root });
  await rm(join(h.projected.location.stateDir, "index"));
  const cycle = async (store: Store = h.f.store) => {
    const command = { checkout: h.f.root, store };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    await endProjection(command);
  };
  await cycle();
  const disk = async () => {
    const read = await readProjectionIndex(h.projected.location, true, { groups: "all" });
    if (read.kind !== "index") throw new Error("The fixture lost its projection index");
    return read.index;
  };
  return { ...h, primary, peer, personal, cohort, cycle, disk, exec };
}

for (const previous of ["nested", "flat"] as const) {
  it(`preserves an unreadable cohort copy while changing from ${previous} layout and retries after repair`, async () => {
    const h = await fixture(previous), target = previous === "nested" ? "flat" : "nested";
    const oldFolder = previous === "nested" ? ".arc/active/current" : ".arc/active";
    const targetFolder = target === "nested" ? ".arc/active/current" : ".arc/active";
    const oldPath = join(h.f.root, oldFolder, "cohort-group.md"), targetPath = join(h.f.root, targetFolder, "cohort-group.md");
    const original = await readFile(oldPath, "utf8"), before = await h.disk();
    const version = success(await h.f.store.version());
    await writeFile(join(h.f.root, ".arc/system/arc-config.yml"), `layout.active: ${target}\n`);
    let failed = true;
    const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "refs/arc/project/cohorts",
      condition: "Named cohort lookup unavailable.", remedy: { text: "Repair the cohort read and refresh again." } });
    const store = overrideEngineStore(h.f.store, { read: input => failed && input.reference.kind === "cohort/document" && input.reference.owner.type === "cohort"
      && input.reference.owner.uid === undefined ? Promise.resolve({ status: "refused", refusal }) : h.f.store.read(input) });
    await h.cycle(store);
    expect(projectionProcessState().diagnostics.some(each => each.mark.reason === refusal.condition)).toBe(true);
    expect(await h.disk()).toMatchObject({ reprojectionPending: true, projectedUnder: before.projectedUnder });
    expect(await readFile(oldPath, "utf8")).toBe(original);
    await expect(readFile(targetPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(parseStampedFile(await readFile(join(h.f.root, targetFolder, "meta-alpha.md"), "utf8")).content).toBe(h.primary.content);
    failed = false;
    await h.cycle(store);
    expect(parseStampedFile(await readFile(targetPath, "utf8")).content).toBe(h.cohort.content);
    await expect(readFile(oldPath)).rejects.toMatchObject({ code: "ENOENT" });
    const current = await h.disk();
    expect(current.projectedUnder.layoutActive).toBe(target);
    expect(current.reprojectionPending).toBeUndefined();
    expect(current.state).toBe(version);
    expect(success(await h.f.store.version())).toBe(version);
  }, AVAILABILITY_TIMEOUT_MS);
}

for (const fault of ["own-primary", "cohort", "view", "rebuild"] as const) {
  it(`keeps uncertain placement during ${fault} failure and converges after read repair alone`, async () => {
    const h = await fixture(), heldPath = fault === "view" ? peerPath : copy;
    const original = await readFile(join(h.f.root, heldPath), "utf8"), before = await h.disk();
    if (fault === "own-primary") success(await h.f.store.write(update(h.f, h.cohort, h.cohort.content + "\nA cohort update.\n")));
    if (fault === "cohort") success(await h.f.store.write(update(h.f, h.primary, h.primary.content + "\nAn independent metadata update.\n")));
    if (fault === "view") success(await h.f.store.write(update(h.f, h.peer, h.peer.content.replace("Initial peer action", "Updated peer action"))));
    success(await h.f.store.write(update(h.f, h.personal, "Independent update.\n")));
    const version = success(await h.f.store.version());
    let failed = true;
    const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "refs/arc/project/work-items",
      condition: `Placement evidence unavailable: ${fault}`, remedy: { text: "Repair the placement read and retry." } });
    const expired = StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable", historyRefs: [],
      condition: "The saved projection anchor expired.", remedy: { text: "Rebuild from current state." } });
    const store = overrideEngineStore(h.f.store, {
      read: input => failed && input.asOf === undefined && (fault === "own-primary" && input.reference.kind === "work-item/meta"
        && input.reference.owner.name === "alpha" || fault === "cohort" && input.reference.kind === "cohort/document")
        ? Promise.resolve({ status: "refused", refusal }) : h.f.store.read(input),
      list: input => failed && input.family === "work-item" && input.owner === undefined
        && (fault === "view" && input.kind === "work-item/meta" || fault === "rebuild")
        ? Promise.resolve({ status: "refused", refusal }) : h.f.store.list(input),
      changes: input => fault === "rebuild" ? Promise.resolve({ status: "refused", refusal: expired }) : h.f.store.changes(input),
    });
    await h.cycle(store);
    expect(await readFile(join(h.f.root, heldPath), "utf8")).toBe(original);
    expect(parseStampedFile(await readFile(join(h.f.root, personalPath), "utf8")).content).toBe("Independent update.\n");
    const held = await h.disk();
    expect(held.state).toBe(before.state);
    expect(projectionProcessState().diagnostics.some(each => each.mark.reason === refusal.condition)).toBe(true);
    failed = false;
    await h.cycle(store);
    const content = parseStampedFile(await readFile(join(h.f.root, heldPath), "utf8")).content;
    expect(content).toBe(fault === "own-primary" ? h.cohort.content + "\nA cohort update.\n"
      : fault === "view" ? h.peer.content.replace("Initial peer action", "Updated peer action") : h.cohort.content);
    const current = await h.disk();
    expect(current.state).toBe(version);
    expect(current.reprojectionPending).toBeUndefined();
    expect(success(await h.f.store.version())).toBe(version);
  }, AVAILABILITY_TIMEOUT_MS);
}
