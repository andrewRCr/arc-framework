/** The store seeding helper writes a temporary repository's starting state where its composed ref backend reads it. */
import { lstat, mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { selectStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences, StoredUidSchema } from "../../src/lib/store/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { readStoreRecord, removeStoreRecord, seedStore } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { commitAll, createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const identity = SlugSchema.parse("test-user");
const inbox = recordReferences["project-inbox/inbox"](OwnerIdentitySchema.parse({ type: "project", name: "project" }));

async function repository(): Promise<string> {
  const root = await createTempRepoCore({ prefix: "arc-store-seeding-" });
  onTestFinished(() => removeGitBackedDir(root));
  return root;
}

/** The store a command composes in this repository once the ref backend is its default. */
function composedStore(root: string): ReturnType<typeof selectStore> {
  return selectStore(createDefaultStorePorts({ checkoutRoot: root }), {});
}

describe("store seeding helper", () => {
  it("seeds records the repository's composed ref backend reads back", async () => {
    const root = await repository();
    const content = "# Project Inbox\n\n## Inbox\n";

    const [seeded] = await seedStore(root, identity, [{ reference: inbox, content }]);

    const store = composedStore(root);
    expect(store.capabilities.stateOffBranch).toBe(true);
    expect(success(await store.read({ reference: inbox }))).toMatchObject({ content, version: seeded?.version });
  });

  it("seeds a work unit whose records carry its lifecycle placement and links", async () => {
    const root = await repository(), name = "seeded-unit";
    const owner = { type: "work-item", name } as const;
    const links = { branches: [{ repository: "example/code", ref: `refs/heads/feat/${name}`, linkedAs: "created" as const, excluded: [] }] };
    const tasks = "# Tasks: Seeded Unit\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Do the work**\n";

    const metaByName = RecordReferenceSchema.parse({ kind: "work-item/meta", owner });
    const tasksByName = RecordReferenceSchema.parse({ kind: "work-item/task-list", owner });
    const [meta, taskList] = await seedStore(root, identity, [
      { reference: metaByName, content: makeMetaFixture(name), placement: { kind: "active" }, links },
      { reference: tasksByName, content: tasks },
    ]);

    expect(meta?.reference.owner).toEqual(taskList?.reference.owner);
    const store = composedStore(root);
    const storedMeta = success(await store.read({ reference: metaByName }));
    const storedOwner = storedMeta.reference.owner;
    const storedUid = StoredUidSchema.parse("uid" in storedOwner ? storedOwner.uid : undefined);
    expect(meta?.reference.owner).toMatchObject({ uid: storedUid });
    expect(taskList?.reference.owner).toMatchObject({ uid: storedUid });
    expect(success(await store.read({ reference: meta!.reference }))).toMatchObject({ placement: { kind: "active" }, links });
    expect(success(await store.read({ reference: taskList!.reference }))).toMatchObject({ content: tasks, version: taskList?.version });
  });

  it("refuses a repository whose tree tracks ARC state before writing anything", async () => {
    const root = await repository();
    const storePath = join(root, ".git", "arc", "store");
    await expect(lstat(storePath)).rejects.toMatchObject({ code: "ENOENT" });
    await mkdir(join(root, ".arc", "active"), { recursive: true });
    await writeFile(join(root, ".arc", "active", "meta-tracked.md"), makeMetaFixture("tracked"));
    await commitAll(root);

    await expect(seedStore(root, identity, [{ reference: inbox, content: "# Project Inbox\n" }]))
      .rejects.toThrow(/tracked-state.*\.arc\/active\//su);
    expect((await makeGitExec(root)("git", ["for-each-ref", "refs/arc/"])).stdout).toBe("");
    await expect(lstat(storePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses reads and removals while HEAD tracks ARC state and preserves the seeded record", async () => {
    const root = await repository();
    const content = "# Tasks: Seeded Unit\n";
    const { taskList } = await seedWorkUnit(root, "seeded-unit", { identity, taskList: content });
    const { reference, version } = taskList!;
    const active = join(root, ".arc", "active");
    const tracked = join(active, "meta-tracked.md");
    await mkdir(active, { recursive: true });
    await writeFile(tracked, makeMetaFixture("tracked"));
    await commitAll(root);
    expect(await composedStore(root).read({ reference }))
      .toMatchObject({ status: "refused", refusal: { code: "tracked-state" } });

    const refusal = /tracked-state.*\.arc\/active\/.*git fetch origin/su;
    await expect.soft(readStoreRecord(root, identity, reference)).rejects.toThrow(refusal);
    await expect.soft(removeStoreRecord(root, identity, reference)).rejects.toThrow(refusal);

    await unlink(tracked);
    await commitAll(root);
    expect(success(await composedStore(root).read({ reference }))).toMatchObject({ version, content });
    await expect(readStoreRecord(root, identity, reference)).resolves.toMatchObject({ version, content });
    await removeStoreRecord(root, identity, reference);
    expect(await composedStore(root).read({ reference }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
});
