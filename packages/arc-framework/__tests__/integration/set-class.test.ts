/** Class changes go through the real handler and the repository's store, committing nothing. */
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { handleSetClass } from "../../src/handlers/lifecycle.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";
import { selectStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seedStore } from "../helpers/store/seed-store.js";
import { success } from "../helpers/store/suite-tools.js";
import { useInRepoStore } from "../helpers/in-repo-store-override.js";
import { commitAll, createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { makeGitExec } from "../helpers/integration.js";
const roots: string[] = [];
const originalCwd = process.cwd();
afterEach(async () => { process.chdir(originalCwd); process.exitCode = 0; await removeGitBackedDirs(roots.splice(0)); });
const meta = () => makeMetaFixture("example", { owner: "test-user", workClass: "Light", currentWorkflow: "process-task-loop", branch: "feat/example" });

async function repository(seed: (root: string) => Promise<void>) {
  const root = await createTempRepoCore({ prefix: "arc-set-class-handler-", identity: "test-user" }); roots.push(root);
  const exec = makeGitExec(root);
  await seed(root);
  await exec("git", ["switch", "-c", "feat/example"]);
  process.chdir(root);
  return { root, exec, head: (await exec("git", ["rev-parse", "HEAD"])).stdout.trim() };
}

async function output(run: () => Promise<void>): Promise<string> {
  const written: string[] = [];
  const write = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { written.push(String(chunk)); return true; });
  try { await run(); } finally { write.mockRestore(); }
  return written.join("");
}

it("writes Class to the stored meta without committing through the real handler", async () => {
  let reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "example" } });
  const repo = await repository(async root => {
    await mkdir(join(root, ".arc/system"), { recursive: true });
    await writeFile(join(root, ".arc/system/arc-config.yml"), "branch.base: main\n");
    await commitAll(root, "chore: install ARC");
    const [seeded] = await seedStore(root, SlugSchema.parse("test-user"), [{ reference, content: meta(), placement: { kind: "active" } }]);
    if (seeded === undefined) throw new Error("The meta was not seeded.");
    reference = seeded.reference;
  });
  await handleSetClass("Heavy", "example");
  expect(process.exitCode ?? 0).toBe(0);
  const store = selectStore(createDefaultStorePorts({ checkoutRoot: repo.root }), {});
  expect(parseMetaRecord(success(await store.read({ reference })).content).workClass).toBe("Heavy");
  expect((await repo.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(repo.head);
});

it("refuses on the in-repo implementation when the selected meta has no agreeing checkout copy", async () => {
  useInRepoStore();
  const path = join(".arc", "active", "meta-example.md");
  const repo = await repository(async root => {
    await mkdir(join(root, ".arc/active"), { recursive: true });
    await writeFile(join(root, path), meta());
    await commitAll(root, "seed work unit");
  });
  await unlink(join(repo.root, path));
  const printed = await output(() => handleSetClass("Heavy", "example"));
  expect(process.exitCode).toBe(1);
  expect(printed).toContain("checkout-not-writable: This checkout holds no meta copy agreeing with the selected record.");
  await expect(readFile(join(repo.root, path), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect((await repo.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(repo.head);
});
