/** View changes use the normal guarded removal path and preserve a protected editor save. */
import { access, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
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
