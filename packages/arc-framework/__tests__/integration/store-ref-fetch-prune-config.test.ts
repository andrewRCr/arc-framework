/** Store fetches leave a person's tags alone whatever fetch pruning their configuration asks for. */
import { expect, it } from "vitest";
import { RecordReferenceSchema, runStoreRemote } from "../../src/lib/store/index.js";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

type Clone = RefSyncFixture["a"];

async function publishedItem(h: RefSyncFixture): Promise<void> {
  success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("alpha"), placement: { kind: "active" },
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
    provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push());
  await h.remote("git", ["tag", "remote-tag", "HEAD"]);
}

async function prunedTags(clone: Clone): Promise<() => Promise<string>> {
  await clone.exec("git", ["tag", "local-only-tag", "HEAD"]);
  await clone.exec("git", ["config", "fetch.prune", "true"]);
  await clone.exec("git", ["config", "fetch.pruneTags", "true"]);
  const tags = async (): Promise<string> => (await clone.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/tags/"])).stdout;
  expect(await tags()).toContain("refs/tags/local-only-tag");
  return tags;
}

it("keeps every code-repository tag through a read source's by-URL fetch under configured fetch pruning", async () => {
  const h = await refSyncFixture("default");
  await publishedItem(h);
  // The state remote is fetched by name, whose stdin refspecs tag pruning cannot reach; a read source is fetched by URL.
  const upstream = `${h.origin}-upstream.git`;
  await h.b.exec("git", ["clone", "--mirror", "--quiet", h.origin, upstream]);
  await h.b.exec("git", ["remote", "add", "upstream", upstream]);
  await h.b.exec("git", ["config", "remote.upstream.arc-state", "read"]);
  const tags = await prunedTags(h.b), before = await tags();
  const pulled = success(await h.b.store.pull());
  expect(pulled.pulls).toMatchObject(expect.arrayContaining([expect.objectContaining({ status: "pulled", remote: "upstream", role: "read" })]));
  expect(await tags()).toBe(before);
  expect((await h.b.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc-remotes/upstream/work/"])).stdout).not.toBe("");
});

it("keeps every code-repository tag through a move of the state back into the code repository's refs", async () => {
  const h = await refSyncFixture("default");
  await publishedItem(h);
  const tags = await prunedTags(h.a), before = await tags(), version = success(await h.a.store.version());
  for (const role of ["off", "push"] as const) {
    expect((await runStoreRemote(h.a.ports, { remote: "origin", role })).status).toBe("ok");
    expect(await tags()).toBe(before);
  }
  expect(success(await h.a.store.version())).toBe(version);
});
