import { expect, it } from "vitest";
import { join } from "node:path";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { success } from "../helpers/store/suite-tools.js";

it("removes an unrecorded refused layout build and retries after forward repair", async () => {
  const h = await refSyncFixture("separate");
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "retained.md" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Retained source content.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  const home = expandStoredPath(reference), tip = (await h.a.git(["rev-parse", home.ref])).stdout;
  const entries: PlantTreeEntry[] = (await h.a.git(["ls-tree", "-r", "--format=%(objectmode) %(objectname) %(path)", tip])).stdout.split("\n").filter(Boolean).map(row => {
    const [mode = "", oid = "", ...path] = row.split(" ");
    if (mode !== "100644") throw new Error("Expected ordinary personal document files");
    return { path: path.join(" "), mode, oid };
  });
  if (!h.a.gitDir) throw new Error("Expected a separate source");
  await h.a.exec("git", ["fetch", "--no-write-fetch-head", "--no-tags", "--", h.a.gitDir, tip]);
  const damaged = await plantRef(h.a.root, home.ref, entries.map(entry => entry.path === home.metadataPath
    ? { path: entry.path, content: "{ damaged destination metadata\n" } : entry), { parents: [tip] });
  const current = success(await h.a.store.read({ reference }));
  const retained = "Retained source content.\nNewer source edit.\n";
  success(await h.a.store.write({ action: "put", reference, expected: current.version, content: retained,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  await h.a.git(["config", "remote.backing.arc-state", "off"]);
  await h.a.exec("git", ["config", "remote.origin.arc-state", "push"]);
  success(await h.a.store.version());
  const source = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const refused = await invokeStoreMigrate([], h.a.ports);
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "namespace-corrupt" } } });
  await expect(h.a.ports.fs.lstat(join(h.a.root, ".git", "arc", "store-migrate-build"))).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect(success(await h.a.store.read({ reference })).content).toBe(retained);
  await plantRef(h.a.root, home.ref, entries, { parents: [damaged.tip] });
  expect((await invokeStoreMigrate([], h.a.ports)).status).toBe("ok");
  await expect(h.a.ports.fs.lstat(join(h.a.root, ".git", "arc", "store"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(success(await h.a.store.read({ reference })).content).toBe(retained);
});
