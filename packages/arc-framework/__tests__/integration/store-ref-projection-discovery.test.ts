/** Native discovery reports links without adopting their targets or withholding an indexed record. */
import { lstat, mkdir, readFile, readdir, rename, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { expect, it } from "vitest";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { endProjection, startProjection } from "../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../src/lib/store/projection/engine-ports.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { createProjectionReporter } from "../../src/lib/store/projection/report.js";
import { projectionProcessState } from "../../src/lib/store/projection/process-state.js";
import { parseStampedFile, renderStampedFile } from "../../src/lib/store/projection/stamp.js";
import { writeMetaOwner } from "../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";

it.each([".arc/user", ".arc"])("keeps indexed and new personal content behind linked %s opaque until repair", async container => {
  const { f } = await createAdoptionFixture();
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/document.md" });
  const record = await seed(f, reference, "accepted content\n");
  const path = ".arc/user/andrew/scratch/document.md", added = ".arc/user/andrew/scratch/new.md";
  const projected = await seedProjection({ store: f.store, checkout: f.root, files: [{ reference: record.reference, path }] });
  const bytes = await readFile(join(f.root, path), "utf8");
  await mkdir(join(f.root, ".arc/user/andrew/scratch"), { recursive: true });
  await writeFile(join(f.root, path), bytes.replace("accepted content", "external target content"));
  await writeFile(join(f.root, added), "external unindexed content\n");
  const external = join(f.root, "outside-projection");
  await rename(join(f.root, container), external);
  await symlink(external, join(f.root, container), "dir");
  const before = success(await f.store.version());
  const ports = createProjectionEnginePorts(f.root);
  expect(await startProjection({ store: f.store, checkout: f.root, ports: () => ({ ...ports,
    walkFs: { lstat: async name => {
      if (name.startsWith(`${join(f.root, container)}${sep}`)) throw new Error("Linked descendants must stay unobserved");
      return lstat(name);
    }, readdir: async name => {
      if (name === join(f.root, container) || name.startsWith(`${join(f.root, container)}${sep}`)) throw new Error("Link target must not be enumerated");
      return readdir(name);
    } },
  }) })).toMatchObject({ kind: "ready" });
  expect(success(await f.store.version())).toBe(before);
  expect(success(await f.store.read({ reference: record.reference })).content).toBe("accepted content\n");
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("The linked checkout lost its index");
  expect(disk.index.entries[added]).toBeUndefined();
  expect(disk.index.entries[path]).toMatchObject({ reference: record.reference, pending: false });
  expect(projectionProcessState().roots.get(f.root)?.blockedByLink(path)).toBe(container);
  await unlink(join(f.root, container));
  await rename(external, join(f.root, container));
  await writeFile(join(f.root, path), bytes.replace("accepted content", "repaired content"));
  await writeFile(join(f.root, added), "repaired new content\n");
  expect(await startProjection({ store: f.store, checkout: f.root })).toMatchObject({ kind: "ready" });
  expect(success(await f.store.read({ reference: record.reference })).content).toBe("repaired content\n");
  const repaired = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (repaired.kind !== "index") throw new Error("No repaired index");
  const adopted = repaired.index.entries[added];
  if (adopted?.kind !== "record") throw new Error("The restored personal file did not adopt");
  expect(success(await f.store.read({ reference: adopted.reference })).content).toBe("repaired new content\n");
});

it.each([false, true])("reports an indexed=%s link without taking in its target and accepts regular-file repair", async indexed => {
  const { f, folder, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const meta = Object.keys(projected.index.entries)[0];
  if (meta === undefined) throw new Error("The native fixture has no projected metadata");
  const path = indexed ? meta : `${folder}/research.txt`;
  const repaired = indexed ? `${await readFile(join(f.root, path), "utf8")}\nIndependent correction.\n` : "Adopted companion.\n";
  if (indexed) await unlink(join(f.root, path));
  const target = join(f.root, "outside-projection.txt");
  await writeFile(target, "outside target content\n");
  await symlink(target, join(f.root, path), "file");
  const before = success(await f.store.version());
  expect(await startProjection({ store: f.store, checkout: f.root })).toMatchObject({ kind: "ready" });
  let report = "";
  createProjectionReporter(f.store, text => { report += text; })();
  expect(report).toContain(path);
  expect(report).toContain("regular file");
  expect(success(await f.store.version())).toBe(before);
  expect(await readFile(target, "utf8")).toBe("outside target content\n");
  const untouched = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (untouched.kind !== "index") throw new Error("The native projection index disappeared");
  if (indexed) expect(untouched.index.entries[path]).toMatchObject({ kind: "record", pending: false, refused: null });
  else expect(untouched.index.entries[path]).toBeUndefined();
  expect(projectionProcessState().roots.get(f.root)?.unsent.has(path)).toBe(false);
  await unlink(join(f.root, path));
  await writeFile(join(f.root, path), repaired);
  expect(await startProjection({ store: f.store, checkout: f.root })).toMatchObject({ kind: "ready" });
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("No repaired native projection index");
  const entry = disk.index.entries[path];
  if (entry?.kind !== "record") throw new Error("The repaired file did not bind to its record");
  expect(success(await f.store.read({ reference: entry.reference })).content).toBe(indexed ? parseStampedFile(repaired).content : repaired);
  expect(await readFile(target, "utf8")).toBe("outside target content\n");
});

it.each(["next-start", "same-command-end"])("retains a late aside save behind a linked directory at %s and recovers it after repair", async phase => {
  const { f, folder, primary, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const path = Object.keys(projected.index.entries)[0];
  if (path === undefined) throw new Error("No native projected metadata");
  const parsed = parseStampedFile(await readFile(join(f.root, path), "utf8"));
  if (parsed.stamp === null) throw new Error("The native metadata has no stamp");
  await writeFile(join(f.root, path), renderStampedFile({ content: `${parsed.content}\nInitial correction.\n`, stamp: parsed.stamp }));
  const ports = createProjectionEnginePorts(f.root);
  await startProjection({ store: f.store, checkout: f.root, ports: () => ({ ...ports,
    writer: async () => ({ ...await ports.writer(), processInstance: "previous-discovery-command" }),
  }) });
  const saved = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (saved.kind !== "index") throw new Error("No saved native metadata index");
  const entry = saved.index.entries[path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No retained native aside copy");
  const copy = entry.copies[0], late = parseStampedFile(await readFile(join(f.root, copy.name), "utf8"));
  if (late.stamp === null) throw new Error("The retained aside lost its original stamp");
  const correction = `${late.content}\nLate recovered note.\n`;
  const refusedBytes = renderStampedFile({ content: writeMetaOwner(correction, SlugSchema.parse("bob")), stamp: late.stamp });
  await writeFile(join(f.root, copy.name), refusedBytes);
  const external = join(f.root, "external-copy-destination"), backup = join(f.root, "authored-directory");
  await mkdir(external);
  const target = join(external, path.slice(path.lastIndexOf("/") + 1));
  const targetBytes = await readFile(join(f.root, path), "utf8");
  await writeFile(target, targetBytes);
  await rename(join(f.root, folder), backup);
  await symlink(external, join(f.root, folder), "dir");
  const before = success(await f.store.version());
  if (phase === "next-start") await startProjection({ store: f.store, checkout: f.root });
  await endProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.version())).toBe(before);
  expect(await readFile(target, "utf8")).toBe(targetBytes);
  expect(await readFile(join(f.root, copy.name), "utf8")).toBe(refusedBytes);
  const retained = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (retained.kind !== "index") throw new Error("The link boundary lost its index");
  expect(retained.index.entries[path]).toMatchObject({ reference: entry.reference, base: entry.base,
    persisted: entry.persisted, copies: entry.copies, markers: entry.markers, notices: entry.notices, unshown: entry.unshown });
  await writeFile(join(f.root, copy.name), renderStampedFile({ content: correction, stamp: late.stamp }));
  await unlink(join(f.root, folder));
  await rename(backup, join(f.root, folder));
  await startProjection({ store: f.store, checkout: f.root });
  await endProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference: primary.reference })).content).toContain("Late recovered note.");
  expect(await readFile(target, "utf8")).toBe(targetBytes);
});

it.each([false, true])("drops an ownerless retry behind a directory-link=%s without importing its target and resumes after repair", async directoryLink => {
  const { f, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const folder = ".arc/backlog/planned/subject", path = `${folder}/research.txt`;
  await mkdir(join(f.root, folder), { recursive: true });
  await writeFile(join(f.root, path), "authored companion\n");
  await startProjection({ store: f.store, checkout: f.root });
  const refused = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (refused.kind !== "index") throw new Error("No native ownerless index");
  expect(refused.index.entries[path]).toMatchObject({ kind: "ownerless" });
  await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "subject" } }),
    makeMetaFixture("subject", { state: "Planning", owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: "draft-design" }),
    { kind: "backlog", commitment: "planned" });
  const external = join(f.root, "external-payload"), target = join(external, "research.txt");
  await mkdir(external);
  await writeFile(target, "external target must not enter the store\n");
  const link = join(f.root, directoryLink ? folder : path), backup = join(f.root, "authored-backup");
  await rename(link, backup);
  await symlink(directoryLink ? external : target, link, directoryLink ? "dir" : "file");
  const before = success(await f.store.version());
  expect(await startProjection({ store: f.store, checkout: f.root })).toMatchObject({ kind: "ready" });
  expect(success(await f.store.version())).toBe(before);
  const skipped = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (skipped.kind !== "index") throw new Error("The native index disappeared behind the link");
  expect(skipped.index.entries[path]).toBeUndefined();
  expect(projectionProcessState().roots.get(f.root)?.unsent.has(path)).toBe(false);
  let report = "";
  createProjectionReporter(f.store, text => { report += text; })();
  expect(report).toContain(directoryLink ? folder : path);
  expect(report).toContain("regular file");
  expect(await readFile(target, "utf8")).toBe("external target must not enter the store\n");
  await unlink(link);
  await rename(backup, link);
  expect(await startProjection({ store: f.store, checkout: f.root })).toMatchObject({ kind: "ready" });
  const repaired = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (repaired.kind !== "index") throw new Error("No repaired native index");
  const entry = repaired.index.entries[path];
  if (entry?.kind !== "record") throw new Error("The restored companion did not adopt");
  expect(success(await f.store.read({ reference: entry.reference })).content).toBe("authored companion\n");
  expect(await readFile(target, "utf8")).toBe("external target must not enter the store\n");
});

it.each(["refused", "pending"])("clears a vanished physical %s edit while retaining its exact record and accepting regular-file repair", async state => {
  const { f, primary, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const path = Object.keys(projected.index.entries)[0];
  if (path === undefined) throw new Error("No native projected metadata");
  const parsed = parseStampedFile(await readFile(join(f.root, path), "utf8"));
  if (parsed.stamp === null) throw new Error("The native metadata has no stamp");
  if (state === "refused") {
    await writeFile(join(f.root, path), renderStampedFile({ content: writeMetaOwner(parsed.content, SlugSchema.parse("bob")), stamp: parsed.stamp }));
  } else {
    await writeFile(join(f.root, path), "");
    const future = new Date(Date.now() + 60_000);
    await utimes(join(f.root, path), future, future);
  }
  await startProjection({ store: f.store, checkout: f.root });
  const refused = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (refused.kind !== "index") throw new Error("No native refused-edit index");
  const entry = refused.index.entries[path];
  if (entry?.kind !== "record") throw new Error("The refused edit lost its exact record");
  if (state === "refused") expect(entry.refused).toMatchObject({ reason: expect.stringContaining("Owner") });
  else expect(entry.pending).toBe(true);
  const backup = join(f.root, "refused-authored.md"), target = join(f.root, "external-refused-target.md");
  await rename(join(f.root, path), backup);
  await writeFile(target, "external target\n");
  await symlink(target, join(f.root, path), "file");
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  const excluded = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (excluded.kind !== "index") throw new Error("The linked physical edit lost its index");
  expect(excluded.index.entries[path]).toMatchObject({ reference: entry.reference, base: entry.base, written: entry.written,
    pending: false, refused: null, stat: null, markers: entry.markers, unshown: entry.unshown });
  expect(success(await f.store.version())).toBe(before);
  expect(await readFile(target, "utf8")).toBe("external target\n");
  await unlink(join(f.root, path));
  await writeFile(join(f.root, path), renderStampedFile({ content: `${parsed.content}\nRepaired physical edit.\n`, stamp: parsed.stamp }));
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference: primary.reference })).content).toContain("Repaired physical edit.");
});
