/** Archive endpoint admission keeps missing-object repair distinct from metadata repair. */

import { expect, it } from "vitest";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const archive = "refs/arc/archive/2026-q4";
const metadataPath = "01_alpha/metadata-12345678-1234-4234-8234-123456789abc.json";

it.each(["fast-forward", "merge"] as const)("holds a %s archive with a missing metadata object until exact restoration", async mode => {
  const h = await refSyncFixture();
  const metadata = JSON.stringify({ formatVersion: 1, slug: "alpha", formats: {},
    primary: { role: "work-item/meta", placement: { kind: "completed", quarter: "2026-q4" } } });
  const content = makeMetaFixture("alpha");
  const base = await plantRef(h.a.root, archive, [{ path: metadataPath, content: metadata },
    { path: "01_alpha/meta-alpha.md", content }], { message: "Archive base" });
  await h.a.git(["push", h.remoteName, `${archive}:${archive}`]);
  await h.b.git(["config", "fetch.unpackLimit", "100000"]);
  await h.b.git(["fetch", "--no-tags", "--refmap=", h.origin, `${archive}:${archive}`]);
  const oid = base.blobs.get(metadataPath);
  if (!oid) throw new Error("Missing planted metadata object");
  const bytes = (await h.b.ports.rawExec(["cat-file", "blob", oid])).stdout;
  const local = mode === "merge" ? await plantRef(h.b.root, archive, [{ path: metadataPath, oid, mode: "100644" },
    { path: "01_alpha/meta-alpha.md", content: `${content}\nLocal archive change.\n` }], { parents: [base.tip], message: "Local archive" }) : base;
  await removeLooseObject(h.b.root, oid);
  const incoming = await plantRef(h.a.root, archive, [{ path: metadataPath, oid, mode: "100644" },
    { path: "01_alpha/meta-alpha.md", content: `${content}\nIncoming archive change.\n` }], { parents: [base.tip], message: "Incoming archive" });
  await h.a.git(["push", h.remoteName, `${archive}:${archive}`]);
  const held = success(await h.b.store.pull());
  await expect(h.b.git(["cat-file", "-e", oid])).rejects.toMatchObject({ exitCode: 1 });
  expect(held.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: archive,
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  }));
  expect((await h.b.git(["rev-parse", archive])).stdout.trim()).toBe(local.tip);
  const restored = await h.b.ports.rawExec(["hash-object", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  expect(success(await h.b.store.pull()).pulls.flatMap(pull => pull.notices)).toEqual([]);
  if (mode === "fast-forward") expect((await h.b.git(["rev-parse", archive])).stdout.trim()).toBe(incoming.tip);
  else expect((await h.b.git(["show", "-s", "--format=%P", archive])).stdout.trim().split(" ")).toEqual([local.tip, incoming.tip]);
});
