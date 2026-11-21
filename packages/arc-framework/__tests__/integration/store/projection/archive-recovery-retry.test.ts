import { link, lstat, mkdir, readFile, rename, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it, vi } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { success, seed, update } from "../../../helpers/store/suite-tools.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { persistProjectionRemoval } from "../../../../src/lib/store/projection/removal-persist.js";
import { releaseProjectionRemoval } from "../../../../src/lib/store/projection/removal-release.js";
import { recordReferences, sameReference } from "../../../../src/lib/store/identity.js";

const stopAfterUnlink = vi.hoisted(() => ({ copy: "" }));
vi.mock("node:fs/promises", async importOriginal => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  const rm: typeof fs.rm = async (path, options) => {
    await fs.rm(path, options);
    if (path === stopAfterUnlink.copy) throw new Error("Stopped after archive alias unlink");
  };
  return { ...fs, rm, default: { ...fs, rm } };
});

it.each([false, true])("classifies edits replacing a returned unindexed destination (stopped after unlink=%s)", async stopped => {
  const h = await archiveRetirementFixture(), { index, location } = await h.disk();
  const path = h.folder + "/returned.txt", dest = join(h.checkout, path);
  const original = "Original.\n", edit = "New saved bytes at returned path.\n";
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "old-copy-writer" };
  const copy = nameAsideFile({ path, base: gitBlobId(original, "sha1"), writer, role: "aside" });
  const aside = join(h.checkout, copy);
  await mkdir(dirname(aside), { recursive: true });
  await writeFile(aside, original);
  await writeProjectionIndex(location, { ...index, state: null, archiveRecoveryCopies: [copy] });
  await link(aside, dest);
  await writeFile(dest + ".next", edit);
  await rename(dest + ".next", dest);
  if (stopped) {
    stopAfterUnlink.copy = aside;
    try { await projectionCommand(h.input, ["status"]).catch(() => undefined); }
    finally { stopAfterUnlink.copy = ""; }
    await expect(lstat(aside)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await h.disk()).index).toMatchObject({ archiveRecoveryCopies: [copy], state: null });
  }
  const result = await projectionCommand(h.input, ["status"]);
  expect(await readFile(dest, "utf8")).toBe(edit);
  const settled = (await h.disk()).index;
  expect(settled.entries[path], JSON.stringify({ retries: settled.archiveRecoveryCopies, state: settled.state, diagnostics: result.diagnostics })).toMatchObject({ withheld: true });
}, 30_000);

it.each(["persist", "release"] as const)("finishes a Markdown resolution accepted during %s after a read-back refusal", async operation => {
  const h = await archiveRetirementFixture(), name = "conflicted.md", path = h.folder + "/" + name;
  const base = await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, name), "opening\nbase\nclosing\n");
  for (const content of ["opening\ncurrent\nclosing\n", "opening\nincoming\nclosing\n"])
    success(await h.store.write(update(h.f, base, content)));
  const current = success(await h.store.read({ reference: base.reference }));
  expect(current.conflicts).toHaveLength(1);
  await projectionCommand(h.input, ["status"]);
  await projectionCommand(h.input, ["edit", join(h.checkout, path)]);
  await h.write(path, current.content);
  let submissions = 0, deny = false, refused = false;
  const store = overrideEngineStore(h.store, { batch: async input => {
    if (input.projectionAdmission?.local.path === path) submissions++;
    const sent = await h.store.batch(input);
    if (submissions === 1 && sent.status === "ok") deny = true;
    return sent;
  }, read: async input => {
    if (!deny || !sameReference(input.reference, base.reference)) return h.store.read(input);
    deny = false; refused = true;
    return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: "archive", condition: "Read unavailable.", remedy: { text: "Retry the read." } } };
  } });
  const retirement = operation === "persist" ? await persistProjectionRemoval(h.checkout, { ...h.context, store })
    : await releaseProjectionRemoval(h.checkout, false, { ...h.context, store });
  expect(retirement).toMatchObject({ kind: "refused" });
  expect(refused).toBe(true);
  const accepted = success(await h.store.read({ reference: base.reference }));
  expect(accepted.conflicts).toHaveLength(0);
  expect(submissions).toBe(1);
  await utimes(join(h.checkout, path), new Date(0), new Date(0));
  const result = await projectionCommand({ ...h.input, store }, ["save"]);
  expect.soft(result.result).toMatchObject({ status: "ok", result: { relocked: [{ path }] } });
  expect.soft(success(await h.store.read({ reference: base.reference })).version).toBe(accepted.version);
  expect(submissions, result.diagnostics).toBe(1);
  const command = { ...h.input, store };
  await projectionCommand(command, ["edit", join(h.checkout, path)]);
  const later = "A later change after installation.\n";
  await h.write(path, later);
  expect((await projectionCommand(command, ["save"])).result).toMatchObject({ status: "ok" });
  const stored = success(await h.store.read({ reference: base.reference }));
  expect(stored.version).not.toBe(accepted.version);
  expect(stored.content).toBe(later);
  expect(submissions).toBe(2);
}, 30_000);
