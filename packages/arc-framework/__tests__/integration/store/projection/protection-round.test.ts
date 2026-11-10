/** Rendering shares observations; persistence still observes current ownership independently. */
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences, sameReference } from "../../../../src/lib/store/identity.js";
import { createProjectionProtection } from "../../../../src/lib/store/projection/protection.js";
import { createProjectionProtectionEvidence } from "../../../../src/lib/store/projection/protection-evidence.js";
import { createProjectionReadMemo } from "../../../../src/lib/store/projection/record-source.js";
import { createRecordRenderer } from "../../../../src/lib/store/projection/record-render.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { createTempRepoCore, removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { localPathsEqual } from "../../../../src/lib/local-path-identity.js";
import { scanRegisteredWorktrees } from "../../../../src/lib/git/worktree-roster.js";
import { createExecaGitExec } from "../../../../src/lib/git/process-executor.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { writeWorktreeMarker, resolveWorktreeMarkerPath } from "../../../../src/lib/git/worktree-marker.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { configureEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { bindProjectionRoot } from "../../../../src/lib/store/projection/engine-binding.js";
import { readProjectionConfiguration } from "../../../../src/lib/store/projection/configuration.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { success } from "../../../helpers/store/suite-tools.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function fixture(markerless = false) {
  const h = createLifecycleHarness();
  const project = markerless ? await h.seed(recordReferences["project-registry/identity"](
    OwnerIdentitySchema.parse({ type: "project", name: "round-project" })), "{}") : null;
  const projectOwner = project?.reference.owner;
  const repository = projectOwner?.type === "project" ? projectOwner.uid : undefined;
  const primary = await h.seedMeta("subject", { owner: "alice" }, { kind: "active" }, repository === undefined ? undefined
    : { branches: [{ repository, ref: "feat/subject", linkedAs: "adopted", excluded: [] }] });
  const tasks = await h.seed(recordReferences["work-item/task-list"](primary.reference.owner), "# Tasks\n\n- [ ] Complete the work\n");
  const checkout = await createTempRepoCore({ prefix: "arc-protection-round-" }); directories.push(checkout);
  await configureEngineCheckout(checkout);
  const exec = createExecaGitExec();
  await exec("git", ["config", "arc.identity", "alice"], { cwd: checkout });
  const path = ".arc/active/in-flight/subject/meta-subject.md";
  const projected = await seedProjection({ store: h.store, checkout, identity: SlugSchema.parse("alice"), files: [{ path, reference: primary.reference }] });
  await exec("git", ["commit", "--allow-empty", "-m", "initial"], { cwd: checkout });
  const parent = await mkdtemp(join(tmpdir(), "arc-round-holder-")); directories.push(parent);
  const holder = join(parent, "holder");
  await exec("git", ["worktree", "add", "-b", "feat/subject", holder], { cwd: checkout });
  await writeWorktreeMarker(holder, { spawnedByArc: true, spawningIdentity: "alice", createdAt: new Date(0).toISOString(),
    createdFor: boundWorkUnitSubject(primary) });
  const scan = await scanRegisteredWorktrees((command, args, options) => exec(command, args, { cwd: checkout, ...options }));
  if (!scan.ok) throw new Error(scan.message);
  let nativeHolder: string | undefined;
  for (const row of scan.worktrees) if (await localPathsEqual(row.path, holder)) nativeHolder = row.path;
  const primaryPath = scan.worktrees.find(row => row.primary)?.path;
  if (nativeHolder === undefined || primaryPath === undefined) throw new Error("Fixture checkout missing from native roster");
  return { ...h, ...projected, path, primary, tasks, checkout: primaryPath, holder: nativeHolder, exec };
}

it("renders one owner's files with one meta read and one worktree listing", async () => {
  const h = await fixture();
  let metaReads = 0, listings = 0;
  const store = overrideEngineStore(h.store, { read: async input => {
    if (sameReference(input.reference, h.primary.reference)) metaReads++;
    return h.store.read(input);
  } });
  const exec: typeof h.exec = async (command, args, options) => {
    if (args[0] === "worktree" && args[1] === "list") listings++;
    return h.exec(command, args, options);
  };
  const source = createProjectionReadMemo(store);
  const evidence = createProjectionProtectionEvidence({ source, checkout: h.checkout, exec });
  const protection = createProjectionProtection({ store, checkout: h.checkout, identity: SlugSchema.parse("alice"), exec, evidence });
  const render = createRecordRenderer({ store: source, memo: createHistoryMemo(store), protection });
  for (const record of [h.primary, h.tasks]) {
    const rendered = success(await render({ record, content: record.content, stamped: true }));
    expect(rendered).toMatchObject({ protected: true });
    expect(rendered.notices.join("\n")).toContain(h.holder);
  }
  expect(metaReads).toBe(1);
  expect(listings).toBe(1);
});


function renderer(h: Awaited<ReturnType<typeof fixture>>) {
  const source = createProjectionReadMemo(h.store);
  const evidence = createProjectionProtectionEvidence({ source, checkout: h.checkout, exec: h.exec });
  const protection = createProjectionProtection({ store: h.store, checkout: h.checkout, identity: SlugSchema.parse("alice"), exec: h.exec, evidence });
  return createRecordRenderer({ store: source, memo: createHistoryMemo(h.store), protection });
}

it("refuses a later edit at the current holder while a completed render keeps its earlier observation", async () => {
  const h = await fixture();
  const render = renderer(h);
  const prior = success(await render({ record: h.primary, content: h.primary.content, stamped: true }));
  expect(prior.notices.join("\n")).toContain(h.holder);
  const entry = h.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Projection entry missing");
  const edited = renderStampedFile({ content: h.primary.content + "\nHand correction.\n", stamp: entry.base.blob, notices: prior.notices });
  await writeFile(join(h.checkout, h.path), edited);
  const moved = h.holder + "-moved";
  await h.exec("git", ["worktree", "move", h.holder, moved], { cwd: h.checkout });
  const ports = createProjectionEnginePorts(h.checkout);
  const configuration = await readProjectionConfiguration(ports.exec, h.checkout);
  const taken = await withProjectionLock(h.location, async session => {
    const root = await bindProjectionRoot({ checkout: h.checkout, store: h.store, location: h.location, configuration, ports,
      actor: "alice@fixture", history: createHistoryMemo(h.store), session, register: false });
    return root.takeIn({ checkout: h.checkout, path: h.path, copy: null, entry, base: { kind: "stamp", stamp: entry.base.blob } });
  });
  expect(taken).toMatchObject({ status: "done", value: { answer: "refused", mark: { remedy: { text: expect.stringContaining(moved) } } } });
  expect(await readFile(join(h.checkout, h.path), "utf8")).toBe(edited);
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
  expect(success(await render({ record: h.primary, content: h.primary.content, stamped: true })).notices.join("\n")).not.toContain(moved);
  await writeFile(join(h.checkout, h.path), renderStampedFile({ content: h.primary.content, stamp: entry.base.blob, notices: prior.notices }));
  const fresh = success(await renderer(h)({ record: h.primary, content: h.primary.content, stamped: true }));
  expect(fresh.notices.join("\n")).toContain(moved);
});

it("classifies an unbound marker through the round source and can retry after that source recovers", async () => {
  const h = await fixture();
  await writeWorktreeMarker(h.holder, { spawnedByArc: true, spawningIdentity: "alice", createdAt: new Date(0).toISOString(),
    createdFor: { kind: "work-unit", name: "subject" } });
  let broken = true;
  const source = overrideEngineStore(h.store, { list: async input => broken && input.family === "work-item"
    ? { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item",
      condition: "The rendering source inventory is unavailable.", remedy: { text: "Repair the rendering source inventory." } } }
    : h.store.list(input) });
  const round = () => createProjectionProtection({ store: h.store, checkout: h.checkout, identity: SlugSchema.parse("alice"), exec: h.exec,
    evidence: createProjectionProtectionEvidence({ source: createProjectionReadMemo(source), checkout: h.checkout, exec: h.exec }) });
  expect((await round()(h.primary))?.reason).toContain("rendering source inventory is unavailable");
  broken = false;
  const recovered = await round()(h.primary);
  expect(recovered?.reason).toContain("unbound");
  expect(recovered?.remedy.text).toContain("arc materialize subject --here");
});


it("shares markerless topology and reads project identity through the rendering source", async () => {
  const h = await fixture(true);
  await rm(resolveWorktreeMarkerPath(h.holder));
  let rosters = 0, identities = 0;
  const store = overrideEngineStore(h.store, { list: async input => {
    if (input.family === "project-registry") identities++;
    return h.store.list(input);
  } });
  const exec: typeof h.exec = async (command, args, options) => {
    if (args[0] === "worktree" && args[1] === "list") rosters++;
    return h.exec(command, args, options);
  };
  const source = createProjectionReadMemo(store);
  const protection = createProjectionProtection({ store, checkout: h.checkout, identity: SlugSchema.parse("alice"), exec,
    evidence: createProjectionProtectionEvidence({ source, checkout: h.checkout, exec }) });
  for (const record of [h.primary, h.tasks]) {
    const mark = await protection(record);
    expect(mark?.remedy.text).toContain(h.holder);
    expect(mark?.remedy.argv).toEqual(["arc", "materialize", "subject", "--here"]);
  }
  expect(rosters).toBe(1);
  expect(identities).toBe(1);
});
