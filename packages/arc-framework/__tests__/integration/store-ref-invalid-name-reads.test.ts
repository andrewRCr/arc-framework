/** Foreign names with invalid UTF-8 do not hide healthy store identities or refs. */
import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";

it.each(["default", "separate"] as const)("reads project identity beside an undecodable registry entry name in %s", async layout => {
  const f = await createRefFixture({}, layout), ref = "refs/arc/project/registry";
  const reference = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
  const content = '{"projectId":"34567890-1234-4234-8234-123456789abc"}';
  success(await f.store.write({ action: "put", reference, content, expected: null, provenance: testProvenance }));
  const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const tip = (await f.ports.exec("git", [...args, "rev-parse", ref])).stdout.trim();
  const oid = (await f.ports.exec("git", [...args, "rev-parse", `${tip}:identity.json`])).stdout.trim();
  const rows = (await f.ports.rawExec([...args, "ls-tree", "-z", tip])).stdout;
  const input = Buffer.concat([rows, Buffer.from(`100644 blob ${oid}\t`), Buffer.from([255, 0])]);
  const tree = new TextDecoder().decode((await f.ports.rawExec([...args, "mktree", "-z"], { input })).stdout).trim();
  const changed = (await f.ports.exec("git", [...args, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com",
    "commit-tree", tree, "-p", tip, "-m", "Plant invalid registry name"])).stdout.trim();
  await f.ports.exec("git", [...args, "update-ref", ref, changed]);
  expect(success(await f.store.read({ reference })).content).toBe(content);
  expect(await f.store.list({ family: "project-registry" })).toMatchObject({ status: "ok", result: {
    status: "complete", missed: true, diagnostics: [expect.objectContaining({ kind: "malformed" })],
    records: [expect.objectContaining({ content })],
  } });
});

it.each(["default", "separate"] as const)("ignores an undecodable foreign ref name during store capture in %s", async layout => {
  const f = await createRefFixture({}, layout), record = await seed(f, f.reference("work-item/meta"));
  const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const uid = record.reference.owner.type !== "person" ? record.reference.owner.uid : undefined;
  const tip = (await f.ports.exec("git", [...args, "rev-parse", `refs/arc/work/${uid}`])).stdout.trim();
  const before = success(await f.store.version());
  const input = Buffer.concat([Buffer.from("create refs/arc/foreign/"), Buffer.from([255]), Buffer.from(` ${tip}\n`)]);
  await f.ports.rawExec([...args, "update-ref", "--stdin"], { input });
  expect(success(await f.store.version())).toBe(before);
  expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
  expect(await f.store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: {
    status: "complete", missed: false, diagnostics: [], records: [expect.objectContaining({ reference: record.reference })],
  } });
});
