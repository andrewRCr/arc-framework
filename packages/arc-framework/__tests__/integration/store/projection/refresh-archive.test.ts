/** Owner placement changes refresh live and cold archived paths through guarded re-lays. */
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success, update, fixtureRenameProvenance } from "../../../helpers/store/suite-tools.js";
import { RecordReferenceSchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("moves every owner file out of active when its primary archives", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(h.f.root);
  const notes = await seed(h.f, recordReferences["work-item/notes"](h.primary.reference.owner), "An archived note.\n");
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection({ checkout: h.f.root, store: h.f.store });
  await endProjection({ checkout: h.f.root, store: h.f.store });
  const anchor = success(await h.f.store.version());
  success(await h.f.store.write({ ...update(h.f, h.primary, h.primary.content.replace("`Active`", "`Shipped`").replace("`process-task-loop`", "[none]")),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    provenance: { verb: "fixture", lifecycleAction: "archive" } }));
  const current = success(await h.f.store.read({ reference: h.primary.reference }));
  expect(success(await h.f.store.read({ reference: current.reference, asOf: anchor }))).toMatchObject({ placement: { kind: "active" } });
  expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
  await expect(readFile(join(h.f.root, ".arc/active/current/meta-alpha.md"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(h.f.root, ".arc/active/current/notes-alpha.md"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(parseStampedFile(await readFile(join(h.f.root, ".arc/completed/2026-q4/01_alpha/notes-alpha.md"), "utf8")).content).toBe(notes.content);
});

it("finds a renamed owner's old files in a settled completed quarter", async () => {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2025-q1") } });
  directories.push(h.f.root);
  const notes = await seed(h.f, recordReferences["work-item/notes"](h.primary.reference.owner), "An older note.\n");
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection({ checkout: h.f.root, store: h.f.store });
  await endProjection({ checkout: h.f.root, store: h.f.store });
  const renamed = RecordReferenceSchema.parse({ ...h.primary.reference, owner: { ...h.primary.reference.owner, name: "beta" } });
  success(await h.f.store.write({ ...update(h.f, h.primary, h.primary.content.replaceAll("alpha", "beta")), reference: renamed,
    provenance: fixtureRenameProvenance }));
  expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
  await expect(readFile(join(h.f.root, ".arc/completed/2025-q1/01_alpha/meta-alpha.md"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(h.f.root, ".arc/completed/2025-q1/01_alpha/notes-alpha.md"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(parseStampedFile(await readFile(join(h.f.root, ".arc/completed/2025-q1/01_beta/notes-beta.md"), "utf8")).content).toBe(notes.content);
});
