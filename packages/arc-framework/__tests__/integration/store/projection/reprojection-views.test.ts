/** View changes use the normal guarded removal path and preserve a protected editor save. */
import { access, chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each([false, true])("adds the all view and safely removes it again with a protected edit=%s", async edited => {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" }); directories.push(h.f.root);
  h.f.identity("bob");
  const beta = await seed(h.f, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "beta" })),
    makeMetaFixture("beta", { owner: "bob", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }),
    { kind: "active" });
  h.f.identity("andrew");
  await rm(join(h.projected.location.stateDir, "index"));
  const command = { checkout: h.f.root, store: h.f.store }, path = ".arc/active/in-flight/beta/meta-beta.md";
  const cycle = async () => { expect(await startProjection(command)).toMatchObject({ kind: "ready" }); await endProjection(command); };
  await cycle();
  await expect(access(join(h.f.root, path))).rejects.toMatchObject({ code: "ENOENT" });
  const version = success(await h.f.store.version());
  await h.f.ports.exec("git", ["config", "arc.inflightView", "all"], { cwd: h.f.root });
  await cycle();
  const rendered = parseStampedFile(await readFile(join(h.f.root, path), "utf8"));
  expect(rendered.content).toBe(beta.content);
  let authored = "";
  if (edited) {
    if (rendered.stamp === null) throw new Error("The view lacks a base stamp");
    authored = renderStampedFile({ content: `${rendered.content}\nA protected editor save.\n`, stamp: rendered.stamp });
    await writeFile(join(h.f.root, `${path}.editor-save`), authored);
    await chmod(join(h.f.root, path), 0o644);
    await rename(join(h.f.root, `${path}.editor-save`), join(h.f.root, path));
  }
  await h.f.ports.exec("git", ["config", "arc.inflightView", "mine"], { cwd: h.f.root });
  await cycle();
  if (edited) {
    expect(await readFile(join(h.f.root, path), "utf8")).toBe(authored);
    const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
    if (disk.kind !== "index") throw new Error("Missing protected removal index");
    expect(disk.index.entries[path]).toMatchObject({ pending: true, refused: { reason: expect.any(String) } });
    await rm(join(h.f.root, path));
    await cycle();
  }
  await expect(access(join(h.f.root, path))).rejects.toMatchObject({ code: "ENOENT" });
  expect(success(await h.f.store.read({ reference: beta.reference })).content).toBe(beta.content);
  expect(success(await h.f.store.version())).toBe(version);
});

it("finishes a held companion's departure from the view once its edit is deleted, without laying it again", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" }); directories.push(h.f.root);
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "beta" });
  h.f.identity("bob");
  await seed(h.f, recordReferences["work-item/meta"](owner),
    makeMetaFixture("beta", { owner: "bob", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }),
    { kind: "active" });
  const notes = await seed(h.f, recordReferences["work-item/notes"](owner), "Beta's notes.\n");
  h.f.identity("andrew");
  await rm(join(h.projected.location.stateDir, "index"));
  const command = { checkout: h.f.root, store: h.f.store }, path = ".arc/active/in-flight/beta/notes-beta.md";
  const cycle = async () => { expect(await startProjection(command)).toMatchObject({ kind: "ready" }); await endProjection(command); };
  await h.f.ports.exec("git", ["config", "arc.inflightView", "all"], { cwd: h.f.root });
  await cycle();
  const rendered = parseStampedFile(await readFile(join(h.f.root, path), "utf8"));
  if (rendered.stamp === null) throw new Error("The view lacks a base stamp");
  expect(rendered.content).toBe(notes.content);
  const authored = renderStampedFile({ content: `${rendered.content}A protected editor save.\n`, stamp: rendered.stamp });
  await writeFile(join(h.f.root, `${path}.editor-save`), authored);
  await chmod(join(h.f.root, path), 0o644);
  await rename(join(h.f.root, `${path}.editor-save`), join(h.f.root, path));
  await h.f.ports.exec("git", ["config", "arc.inflightView", "mine"], { cwd: h.f.root });
  await cycle();
  expect(await readFile(join(h.f.root, path), "utf8")).toBe(authored);
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" })).toMatchObject({ kind: "index",
    index: { entries: { [path]: { pending: true } } } });
  await rm(join(h.f.root, path));
  await cycle();
  await cycle();
  await expect(access(join(h.f.root, path))).rejects.toMatchObject({ code: "ENOENT" });
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(disk.kind === "index" ? disk.index.entries[path] : "unread").toBeUndefined();
  expect(success(await h.f.store.read({ reference: notes.reference })).content).toBe(notes.content);
});

it("acknowledges a view change while an unrelated own edit stays held", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" }); directories.push(h.f.root);
  await seed(h.f, recordReferences["work-item/notes"](h.primary.reference.owner), "Opening.\nBase.\nClosing.\n");
  await rm(join(h.projected.location.stateDir, "index"));
  const source = createRefusingStore(h.f.store);
  const command = { checkout: h.f.root, store: source.store }, path = ".arc/active/current/notes-alpha.md";
  const cycle = async () => { expect(await startProjection(command)).toMatchObject({ kind: "ready" }); await endProjection(command); };
  await cycle();
  const rendered = parseStampedFile(await readFile(join(h.f.root, path), "utf8"));
  if (rendered.stamp === null) throw new Error("The own file lacks a base stamp");
  await writeFile(join(h.f.root, path), renderStampedFile({ content: "Opening.\nA held edit.\nClosing.\n", stamp: rendered.stamp }));
  source.refuse("batch", StoreRefusalSchema.parse({ code: "lock-held", class: "recoverable", lock: "refs/arc/project/work-items",
    condition: "Another writer holds the namespace.", remedy: { text: "Retry once the other writer finishes." } }));
  await h.f.ports.exec("git", ["config", "arc.inflightView", "all"], { cwd: h.f.root });
  await cycle();
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing index");
  expect(disk.index.entries[path]).toMatchObject({ pending: true });
  expect(disk.index.projectedUnder.view.mode).toBe("all");
  expect(disk.index.reprojectionPending).toBeUndefined();
});
