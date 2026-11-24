/** Native retirement refuses unopened archive input before landing it, then continues after the named repair. */
import { readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { releaseProjectionRemoval } from "../../../../src/lib/store/projection/removal-release.js";
import { persistProjectionRemoval } from "../../../../src/lib/store/projection/removal-persist.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";

afterEach(() => { beginProjectionCommand(); });

it.each(["persist", "release"] as const)("refuses a late correction to a closed archive file during %s", async operation => {
  const h = await archiveRetirementFixture(), file = join(h.checkout, h.path);
  const before = success(await h.store.read({ reference: h.primary.reference }));
  const content = before.content + "\nA correction saved during retirement.\n";
  let written: string | undefined;
  const edit = async () => {
    if (written !== undefined) return;
    await h.write(h.path, content);
    written = await readFile(file, "utf8");
  };
  const retired = operation === "persist"
    ? await persistProjectionRemoval(h.checkout, { ...h.context, hooks: { afterFileSelection: edit } })
    : await releaseProjectionRemoval(h.checkout, false, { ...h.context, ports: checkout => ({
      ...createProjectionEnginePorts(checkout), hooks: { afterRecheck: async path => { if (path === h.path) await edit(); } },
    }) });
  expect(written).toContain(content);
  expect(retired).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining(`arc edit ${h.path} then arc save`) } });
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content: before.content, version: before.version });
  expect(await readFile(file, "utf8")).toBe(written);
  expect(await h.retire(operation)).toMatchObject({ kind: "refused" });
  expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
}, 30_000);

it.each(["persist", "release"] as const)("%s retains a lost-index edit until deletion and explicit reapplication", async operation => {
  const h = await archiveRetirementFixture(), file = join(h.checkout, h.path);
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  const content = h.primary.content + "\nAn edit retained through retirement and index loss.\n";
  await h.write(h.path, content);
  const bytes = await readFile(file, "utf8");
  await rm(join((await h.disk()).location.stateDir, "index"));
  expect((await projectionCommand(h.input, ["status"])).result).toMatchObject({ kind: "ready" });
  expect((await h.disk()).index.entries[h.path]).toMatchObject({ withheld: true });
  const result = await h.retire(operation);
  expect(result).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("delete") } });
  if (result.kind !== "refused") throw new Error("No withheld-file repair");
  expect(result.remedy.text).toContain(`arc edit ${h.path}`);
  expect(await readFile(file, "utf8")).toBe(bytes);
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
  await rm(file);
  await projectionCommand(h.input, ["status"]);
  await h.openAndSave(h.path, content);
  expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
}, 30_000);

it("excludes every unopened archive input while reporting the first refusal", async () => {
  const h = await archiveRetirementFixture(), path = `${h.folder}/z-second-correction.md`;
  const before = success(await h.store.read({ reference: h.primary.reference }));
  await h.write(h.path, h.primary.content + "\nA forced first correction.\n");
  await h.write(path, "A new second correction.\n");
  expect(await h.retire("persist")).toMatchObject({ kind: "refused" });
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content: before.content, version: before.version });
  expect(await h.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "z-second-correction.md") }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await readFile(join(h.checkout, h.path), "utf8")).toContain("A forced first correction.");
  expect(await readFile(join(h.checkout, path), "utf8")).toBe("A new second correction.\n");
}, 30_000);

const noEdit = (["persist", "release"] as const).flatMap(operation => (["absent", "empty"] as const).map(state => ({ operation, state })));
it.each(noEdit)("$operation preserves the stored version when an opened archive is left $state", async ({ operation, state }) => {
  const h = await archiveRetirementFixture(), file = join(h.checkout, h.path);
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  const before = success(await h.store.read({ reference: h.primary.reference }));
  if (state === "absent") await rm(file);
  else { await writeFile(file, ""); await utimes(file, new Date(0), new Date(0)); }
  const result = await h.retire(operation);
  if (operation === "release" && state === "empty") {
    // Release's new empty swap copy waits for the next command even though the settled original held no edit.
    expect(result).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("Release already removed projected files") } });
    const disk = await h.disk(), entry = disk.index.entries[h.path];
    if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No retained empty release copy");
    expect(disk.index.state).toBeNull();
    expect(await readFile(join(h.checkout, entry.copies[0].name), "utf8")).toBe("");
    expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok" });
    expect(await h.retire(operation)).toEqual({ kind: "released" });
  } else expect(result).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content: before.content, version: before.version });
}, 30_000);

it("drops a deleted opened new archive entry before linked release completes", async () => {
  const h = await archiveRetirementFixture(), path = `${h.folder}/deleted-opening.md`;
  await h.write(path, "A new file that will not be kept.\n");
  expect((await projectionCommand(h.input, ["edit", join(h.checkout, path)])).result).toMatchObject({ status: "ok" });
  expect((await h.disk()).index.entries[path]).toMatchObject({ opened: true });
  await rm(join(h.checkout, path));
  let observedDrop = false;
  const result = await releaseProjectionRemoval(h.checkout, false, { ...h.context, hooks: { beforeLastCheck: async () => {
    expect((await h.disk()).index.entries).not.toHaveProperty(path);
    observedDrop = true;
  } } });
  expect(result).toEqual({ kind: "released" });
  expect(observedDrop).toBe(true);
  expect(await h.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "deleted-opening.md") }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, 30_000);

const opened = (["persist", "release"] as const).flatMap(operation => (["existing", "new"] as const).map(kind => ({ operation, kind })));
it.each(opened)("$operation lands an opened $kind archive file without a preceding save", async ({ operation, kind }) => {
  const h = await archiveRetirementFixture();
  const path = kind === "existing" ? h.path : `${h.folder}/opened-correction.md`;
  const reference = kind === "existing" ? h.primary.reference : recordReferences["work-item/companion"](h.primary.reference.owner, "opened-correction.md");
  if (kind === "new") await h.write(path, "A new correction basis.\n");
  expect((await projectionCommand(h.input, ["edit", join(h.checkout, path)])).result).toMatchObject({ status: "ok" });
  const content = kind === "existing" ? h.primary.content + "\nAn opened correction.\n" : "An adopted opened correction.\n";
  await h.write(path, content);
  expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
  expect(success(await h.store.read({ reference })).content).toBe(content);
  if (operation === "release") await expect(readFile(join(h.checkout, path))).rejects.toMatchObject({ code: "ENOENT" });
}, 30_000);

it("holds the primary's release over a forced archive edit until edit and save there", async () => {
  const h = await archiveRetirementFixture(), checkout = h.f.root;
  const content = h.primary.content + "\nA primary archive correction.\n";
  await h.write(h.path, content, checkout);
  const bytes = await readFile(join(checkout, h.path), "utf8");
  expect(await h.retire("release", checkout)).toMatchObject({ kind: "refused", remedy: {
    text: expect.stringContaining(`arc edit ${h.path}`),
  } });
  expect(await readFile(join(checkout, h.path), "utf8")).toBe(bytes);
  expect(success(await h.f.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
  await h.openAndSave(h.path, undefined, checkout);
  expect(await h.retire("release", checkout)).toEqual({ kind: "released" });
  expect(success(await h.f.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await readFile(join(checkout, h.path), "utf8")).toContain("A primary archive correction.");
}, 30_000);

const blocked = (["persist", "release"] as const).flatMap(operation => (["forced", "new"] as const)
  .flatMap(kind => (["primary", "target"] as const).map(caller => ({ operation, kind, caller }))));

it.each(blocked)("$operation keeps an unopened $kind file unchanged when called from $caller", async ({ operation, kind, caller }) => {
  const h = await archiveRetirementFixture();
  const path = kind === "forced" ? h.path : `${h.folder}/new-correction.md`;
  const reference = kind === "forced" ? h.primary.reference : recordReferences["work-item/companion"](h.primary.reference.owner, "new-correction.md");
  const content = kind === "forced" ? h.primary.content + "\nA forced correction.\n" : "A new archived correction.\n";
  const before = await h.store.read({ reference });
  await h.write(path, content);
  const bytes = await readFile(join(h.checkout, path), "utf8");
  const refused = await h.retire(operation, h.checkout, caller === "primary" ? h.f.root : h.checkout);
  expect(refused).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining(`arc edit ${path}`) } });
  if (refused.kind !== "refused") throw new Error("No archive retirement remedy");
  expect(refused.remedy.text).toContain("arc save");
  expect(refused.remedy.text).toContain(h.checkout);
  expect(await readFile(join(h.checkout, path), "utf8")).toBe(bytes);
  expect(await h.store.read({ reference })).toEqual(before);
  await h.openAndSave(path);
  expect(success(await h.store.read({ reference })).content).toBe(content);
  expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
  if (operation === "release") await expect(readFile(join(h.checkout, path))).rejects.toMatchObject({ code: "ENOENT" });
}, 30_000);
