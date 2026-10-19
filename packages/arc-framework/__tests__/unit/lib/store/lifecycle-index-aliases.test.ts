/** Lifecycle entries expose retained former names only when there are any. */
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { listHeldLifecycleIndex, listLifecycleIndex } from "../../../../src/lib/store/lifecycle-index.js";
import { createStore } from "../../../../src/lib/store/create.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { testStorePorts } from "../../../helpers/store/in-repo-ports.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("carries a renamed work unit's former slug", async () => {
  const h = createLifecycleHarness();
  const original = await h.seedMeta("original");
  const renamed = RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: renamed, expected: original.version,
    content: original.content.replaceAll("original", "current"), placement: { kind: "active" },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));

  const listing = lifecycleSuccess(await listLifecycleIndex(h.store));
  if (listing.status !== "complete") throw new Error("Expected renamed work unit");
  expect(listing.index.get(renamed.owner)).toMatchObject({ reference: renamed, aliases: ["original"] });
});

it("omits aliases for a primary with an empty former-name list", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("original");
  expect(primary.aliases).toEqual([]);
  const listing = lifecycleSuccess(await listLifecycleIndex(h.store));
  if (listing.status !== "complete") throw new Error("Expected unrenamed work unit");
  expect(listing.index.get(primary.reference.owner)).not.toHaveProperty("aliases");
});

it("omits aliases when the in-repo primary has no alias field", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-lifecycle-aliases-")); roots.push(root);
  await mkdir(join(root, ".arc/active"), { recursive: true });
  await writeFile(join(root, ".arc/active/meta-example.md"), makeMetaFixture("example"));
  const noGit = async (): Promise<never> => { throw new Error("Git is unavailable in this directory"); };
  const store = createStore(testStorePorts(root, noGit, noGit));
  const direct = lifecycleSuccess(await store.list({ family: "work-item", kind: "work-item/meta", filter: { heldHere: true } }));
  if (direct.status !== "complete") throw new Error("Expected held primary");
  expect(direct.records).toHaveLength(1);
  expect(direct.records[0]).not.toHaveProperty("aliases");

  const listing = lifecycleSuccess(await listHeldLifecycleIndex(store));
  if (listing.status !== "complete") throw new Error("Expected held work unit");
  expect(listing.index.entries()).toHaveLength(1);
  expect(listing.index.entries()[0]).not.toHaveProperty("aliases");
});
