/** A new owner arriving at a canonical path vacated by an earlier generation. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { cohortDoc } from "../../../helpers/store/cohort-rule-input.js";
import { plantRefPrimary } from "../../../helpers/store/ref-primary-plant.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { runCohortRename } from "../../../../src/lib/store/cohort-rename.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { saveAs, SAVE_MODES } from "../../../helpers/store/projection/save-loss.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { materializeProjectionRoot } from "../../../../src/lib/store/projection/materialization.js";
import { readProjectionConfiguration } from "../../../../src/lib/store/projection/configuration.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";

import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { captureWriteBackFile, prepareCapturedWriteBack } from "../../../../src/lib/store/projection/write-back.js";
import { prepareIndexedProjectionSubmission } from "../../../../src/lib/store/projection/submission.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function reusedPathFixture(plantArrival = true) {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(h.f.root);
  const first = await seed(h.f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })), cohortDoc().content);
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection({ checkout: h.f.root, store: h.f.store });
  await endProjection({ checkout: h.f.root, store: h.f.store });
  const path = ".arc/backlog/planned/group/cohort-group.md";
  const old = await readFile(join(h.f.root, path), "utf8");
  expect(await runCohortRename(h.f.store, first, { operand: "group", targetSlug: "root" })).toMatchObject({ status: "renamed" });
  const arrived = cohortDoc().content.replace("Coordinate the work.", "A distinct arriving generation.");
  const receive = () => plantRefPrimary(h.f, { kind: "cohort/document" as const, name: "group",
    uid: "00000000-0000-4000-8000-000000000099", content: arrived });
  if (plantArrival) await receive();
  return { ...h, first, arrived, path, old, receive };
}

it("keeps a new generation retryable when it arrives at a renamed cohort's former path", async () => {
  const h = await reusedPathFixture();
  for (let command = 0; command < 2; command += 1) {
    expect(await startProjection({ checkout: h.f.root, store: h.f.store })).toMatchObject({ kind: "ready" });
    await endProjection({ checkout: h.f.root, store: h.f.store });
  }
  expect(parseStampedFile(await readFile(join(h.f.root, ".arc/backlog/planned/root/cohort-root.md"), "utf8")).content).toContain("root");
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(h.arrived);
});

it.each(SAVE_MODES)("holds a late %s save across command end and resumes after deletion", async mode => {
  const h = await reusedPathFixture();
  const command = { checkout: h.f.root, store: h.f.store };
  // The first command removes the departing generation; its end settles the last old aside copy.
  await startProjection(command);
  await endProjection(command);
  await startProjection(command);
  const journal = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(journal).toMatchObject({ kind: "index", index: { entries: { [h.path]: { withheld: true,
    handoff: { reference: { owner: { uid: "00000000-0000-4000-8000-000000000099" } } },
  } } } });
  const late = h.old.replace("Coordinate the work.", "A late leaving save must stay recoverable.");
  await saveAs(mode, join(h.f.root, h.path), late);
  await endProjection(command);
  await startProjection(command);
  await endProjection(command);
  expect(await readFile(join(h.f.root, h.path), "utf8")).toBe(late);
  const held = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(held).toMatchObject({ kind: "index", index: { entries: { [h.path]: { withheld: true,
    handoff: { reference: { owner: { uid: "00000000-0000-4000-8000-000000000099" } } },
  } } } });
  expect(await h.f.store.read({ reference: h.first.reference })).toMatchObject({ status: "ok",
    result: { content: expect.not.stringContaining("A late leaving save") } });
  const arrival = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group",
    uid: "00000000-0000-4000-8000-000000000099" }));
  expect(await h.f.store.read({ reference: arrival })).toMatchObject({ status: "ok", result: { content: h.arrived } });
  await rm(join(h.f.root, h.path));
  await startProjection(command);
  await endProjection(command);
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(h.arrived);
});

async function materializeExisting(h: Awaited<ReturnType<typeof reusedPathFixture>>) {
  const root = projectionProcessState().roots.get(h.f.root);
  if (root === undefined) throw new Error("Missing bound root");
  const configuration = await readProjectionConfiguration(root.ports.exec, h.f.root);
  const version = success(await h.f.store.version());
  const result = await withProjectionLock(root.location, async session => {
    root.checkpoint = session.step;
    try {
      const disk = await readProjectionIndex(root.location, true, { groups: "all" });
      if (disk.kind !== "index") throw new Error("Missing materialization input");
      return await materializeProjectionRoot({ root, source: h.f.store, configuration, version, index: disk.index });
    } finally { root.checkpoint = null; }
  });
  if (result.status !== "done") throw new Error("Materialization lease refused");
  return result.value.index;
}

it("uses the same journal and recovery when fully materializing an existing index", async () => {
  const h = await reusedPathFixture();
  const before = await readProjectionIndex(h.projected.location, true);
  if (before.kind !== "index") throw new Error("Missing original anchor");
  const first = await materializeExisting(h);
  expect(first.state).toBe(before.index.state);
  await endProjection({ checkout: h.f.root, store: h.f.store });
  const second = await materializeExisting(h);
  expect(second.entries[h.path]).toMatchObject({ withheld: true, handoff: { reference: { owner: {
    uid: "00000000-0000-4000-8000-000000000099",
  } } } });
  const recovered = await materializeExisting(h);
  expect(recovered.entries[h.path]).toMatchObject({ reference: { owner: { uid: "00000000-0000-4000-8000-000000000099" } },
    withheld: false, pending: false });
  expect(recovered.state).toBe(success(await h.f.store.version()));
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(h.arrived);
  await endProjection({ checkout: h.f.root, store: h.f.store });
});

it("retries a pending departure when a later primary arrival occupies its old plan key", async () => {
  const h = await reusedPathFixture(false);
  const command = { checkout: h.f.root, store: h.f.store };
  const leaving = success(await h.f.store.read({ reference: h.first.reference }));
  const rendered = renderStampedFile({ content: leaving.content, stamp: gitBlobId(leaving.content, "sha1") });
  const late = rendered.replace("Coordinate the work.", "A valid late correction.");
  const refused = createRefusingStore(h.f.store);
  refused.refuse("batch", StoreRefusalSchema.parse({ code: "lock-held", class: "recoverable", lock: "cohort",
    condition: "The leaving edit is temporarily locked.", remedy: { text: "Release the lock and retry." } }));
  let stopped = false;
  const native = createProjectionEnginePorts(h.f.root);
  await startProjection({ ...command, store: refused.store, ports: () => ({ ...native,
    writer: async () => ({ ...await native.writer(), processInstance: "blocked-departure-writer" }), hooks: {
    afterRecheck: async path => {
      if (path !== h.path || stopped) return;
      stopped = true;
      await writeFile(join(h.f.root, path), late);
    },
  } }) });
  await endProjection({ ...command, store: refused.store });
  expect(stopped).toBe(true);
  const held = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("Missing pending departure");
  const entry = held.index.entries[h.path];
  if (entry?.kind !== "record" || entry.copies.length === 0) throw new Error("Missing refused late copy");
  for (const copy of entry.copies) {
    expect(await readFile(join(h.f.root, copy.name), "utf8")).toBe(late);
    await rm(join(h.f.root, copy.name));
  }
  expect(await h.f.store.read({ reference: h.first.reference })).toMatchObject({ status: "ok", result: { content: leaving.content } });
  await writeFile(join(h.f.root, h.path), rendered);
  await h.receive();
  const version = success(await h.f.store.version());
  for (let retry = 0; retry < 3; retry += 1) {
    await startProjection(command);
    await endProjection(command);
  }
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(h.arrived);
  expect(success(await h.f.store.version())).toBe(version);
});

it("keeps the captured old basis while canonical naming is rechecked at atomic admission", async () => {
  const h = await reusedPathFixture();
  const root = projectionProcessState().roots.get(h.f.root);
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (root === undefined || disk.kind !== "index") throw new Error("Missing captured root");
  const entry = disk.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing leaving basis");
  const authored = h.old.replace("Coordinate the work.", "Authored before a second rename.");
  await writeFile(join(h.f.root, h.path), authored);
  const request = { checkout: h.f.root, path: h.path, copy: null, entry,
    base: { kind: "stamp" as const, stamp: entry.base.blob } };
  const captured = await captureWriteBackFile(root.context, request);
  if (captured.kind !== "read") throw new Error("Authored input did not settle");
  const prepare = async () => {
    const content = await prepareCapturedWriteBack(root.context, request, captured);
    if (content.kind !== "ready") throw new Error("Captured edit refused");
    expect(content.selectedBase).toMatchObject({ kind: "stored", version: entry.base.version });
    expect(request.entry.reference).toEqual(h.first.reference);
    return success(await prepareIndexedProjectionSubmission(root.context, request, content));
  };
  const stale = await prepare();
  expect(stale.plan.mutation.reference.owner).toMatchObject({ uid: h.first.reference.owner.type === "cohort"
    ? h.first.reference.owner.uid : "missing", name: "root" });
  const current = success(await h.f.store.read({ reference: h.first.reference }));
  expect(await runCohortRename(h.f.store, current, { operand: "root", targetSlug: "other" })).toMatchObject({ status: "renamed" });
  expect(await h.f.store.batch(stale.batch)).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
  expect(success(await h.f.store.read({ reference: h.first.reference })).reference.owner.name).toBe("other");
  const fresh = await prepare();
  expect(fresh.plan.mutation.reference.owner.name).toBe("other");
  expect(await h.f.store.batch(fresh.batch)).toMatchObject({ status: "ok" });
  const updated = success(await h.f.store.read({ reference: h.first.reference }));
  expect(updated.reference.owner.name).toBe("other");
  expect(updated.content).toContain("Authored before a second rename.");
  const arriving = entry.reference.owner.type === "cohort" ? recordReferences["cohort/document"](OwnerIdentitySchema.parse({
    type: "cohort", name: "group", uid: "00000000-0000-4000-8000-000000000099",
  })) : entry.reference;
  expect(success(await h.f.store.read({ reference: arriving })).content).toBe(h.arrived);
});
