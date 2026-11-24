/** Archived rendering explains how to open a correction without coupling content to its local mode. */
import { rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture, createErrandAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { cohortDoc } from "../../../helpers/store/cohort-rule-input.js";
import { openArchivedProjectionFile } from "../../../helpers/store/projection/open-file.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { completedCohortPath } from "../../../../src/lib/store/lifecycle-record-path.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { createProjectionProtection } from "../../../../src/lib/store/projection/protection.js";
import { createRecordRenderer } from "../../../../src/lib/store/projection/record-render.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { projectionLayMode } from "../../../../src/lib/store/projection/lay-mode.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";

const directories: string[] = [];
const quarter = ArchiveQuarterSchema.parse("2026-q4");
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each(["work-unit", "cohort", "errand"] as const)("names the exact open and save commands on an archived %s", async kind => {
  const h = kind === "errand" ? await createErrandAdoptionFixture({ completed: true })
    : await createAdoptionFixture({ placement: { kind: "completed", quarter } });
  directories.push(h.f.root);
  let record = "description" in h ? h.description : h.primary;
  if (kind === "cohort") {
    const prior = await seed(h.f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })), cohortDoc().content);
    success(await h.f.store.write({ ...update(h.f, prior, prior.content), placement: { kind: "completed", quarter },
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
    record = success(await h.f.store.read({ reference: prior.reference }));
  }
  const path = kind === "cohort" ? completedCohortPath(record) : Object.keys(h.projected.index.entries)[0]!;
  const protection = createProjectionProtection({ store: h.f.store, checkout: h.f.root, identity: SlugSchema.parse("andrew"),
    exec: createProjectionEnginePorts(h.f.root).exec });
  const file = success(await stageRecordFile({ checkout: h.f.root, path, record, replacing: "0".repeat(40), format: "sha1",
    layMode: projectionLayMode(path), renderer: createRecordRenderer({ store: h.f.store, protection }),
    writer: { pid: process.pid, processInstance: "archive-notice", processScope: "archive-notice" } }));
  const bytes = await readFile(join(h.f.root, file.location), "utf8");
  expect(bytes).toContain(`From the checkout's root, run arc edit ${path} to open this file for editing.`);
  expect(bytes).toContain("your editor");
  expect(bytes.indexOf(`arc edit ${path}`)).toBeLessThan(bytes.indexOf("arc save"));
  expect(file.rendering?.protected).toBe(false);
});

it("keeps the same notice bytes when an archived file opens and refreshes", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter } });
  directories.push(h.f.root);
  const path = Object.keys(h.projected.index.entries)[0]!, input = { store: h.f.store, checkout: h.f.root };
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection(input); await endProjection(input);
  const before = await readFile(join(h.f.root, path));
  expect(before.toString()).toContain(`From the checkout's root, run arc edit ${path}`);
  const original = await stat(join(h.f.root, path), { bigint: true });
  await openArchivedProjectionFile(input, path);
  await startProjection(input); await endProjection(input);
  expect(await readFile(join(h.f.root, path))).toEqual(before);
  const after = await stat(join(h.f.root, path), { bigint: true });
  expect({ ino: after.ino, mtime: after.mtimeNs }).toEqual({ ino: original.ino, mtime: original.mtimeNs });
  expect(after.mode & 0o200n).not.toBe(0n);
});

it.each(["protected", "active", "plain", "unbound"] as const)("omits the archive-opening notice for %s rendering", async kind => {
  const h = await createAdoptionFixture(kind === "active" ? { placement: { kind: "active" }, ownLayout: "nested" }
    : { placement: { kind: "completed", quarter }, ...(kind === "protected" ? { owner: "beth" } : {}) });
  directories.push(h.f.root);
  const record = kind === "plain" ? await seed(h.f,
    recordReferences["work-item/companion"](h.primary.reference.owner, "correction.txt"), "Plain archive prose.\n") : h.primary;
  const path = kind === "plain" ? `${h.folder}/correction.txt` : Object.keys(h.projected.index.entries)[0]!;
  const protection = createProjectionProtection({ store: h.f.store, checkout: h.f.root, identity: SlugSchema.parse("andrew"),
    exec: createProjectionEnginePorts(h.f.root).exec });
  const renderer = createRecordRenderer({ store: h.f.store, ...(kind === "unbound" ? {} : { protection }) });
  const rendered = success(await renderer({ path, record, content: record.content, stamped: kind !== "plain" }));
  expect(rendered.notices.join("\n")).not.toContain("arc edit");
  const file = success(await stageRecordFile({ checkout: h.f.root, path, record, replacing: "0".repeat(40), format: "sha1",
    layMode: projectionLayMode(path), renderer,
    writer: { pid: process.pid, processInstance: "notice-eligibility", processScope: "archive-notice" } }));
  const bytes = await readFile(join(h.f.root, file.location), "utf8");
  expect(bytes).not.toContain("arc edit");
  if (kind === "protected") {
    expect(bytes).toContain("Code generated by ARC. DO NOT EDIT.");
    expect(bytes).toContain("beth");
  } else expect(bytes).not.toContain("Code generated by ARC. DO NOT EDIT.");
  if (kind === "plain") expect(bytes).toBe(record.content);
});
