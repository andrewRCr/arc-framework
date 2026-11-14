/** The store seeding helper writes a temporary repository's starting state where its composed ref backend reads it. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { selectStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences } from "../../src/lib/store/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seedStore } from "../helpers/store/seed-store.js";
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

    const [meta, taskList] = await seedStore(root, identity, [
      { reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner }), content: makeMetaFixture(name),
        placement: { kind: "active" }, links },
      { reference: RecordReferenceSchema.parse({ kind: "work-item/task-list", owner }), content: tasks },
    ]);

    expect(meta?.reference.owner).toEqual(taskList?.reference.owner);
    const store = composedStore(root);
    expect(success(await store.read({ reference: meta!.reference }))).toMatchObject({ placement: { kind: "active" }, links });
    expect(success(await store.read({ reference: taskList!.reference }))).toMatchObject({ content: tasks, version: taskList?.version });
  });

  it("refuses a repository whose tree tracks ARC state before writing anything", async () => {
    const root = await repository();
    await mkdir(join(root, ".arc", "active"), { recursive: true });
    await writeFile(join(root, ".arc", "active", "meta-tracked.md"), makeMetaFixture("tracked"));
    await commitAll(root);

    await expect(seedStore(root, identity, [{ reference: inbox, content: "# Project Inbox\n" }]))
      .rejects.toThrow(/tracked-state.*\.arc\/active\//su);
    expect((await makeGitExec(root)("git", ["for-each-ref", "refs/arc/"])).stdout).toBe("");
  });
});
