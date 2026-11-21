/** Real-CLI coverage for Candidate proposal publication. */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
} from "./helpers.js";
import { advanceBase, movementPaths } from "../helpers/base-advance.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { recordReferences, type RecordReference } from "../../src/lib/store/identity.js";

/**
 * Give the fixture a base it can actually move: a bare repository reached through a host-shaped URL, so the
 * origin both parses as an owner-and-repository coordinate and pushes somewhere real. It lives inside the
 * fixture so one cleanup reaches it, and outside Git's view so it never reads as reviewable content.
 */
async function attachOrigin(repository: string): Promise<void> {
  const remote = join(repository, ".arc-fixture", "origin.git");
  await mkdir(join(repository, ".arc-fixture"), { recursive: true });
  await writeFile(join(repository, ".git", "info", "exclude"), ".arc-fixture/\n", { flag: "a" });
  await git(repository, ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["remote", "add", "origin", remote]);
  await git(repository, ["config", `url.${remote}.insteadOf`, "git@github.com:owner/repo.git"]);
  await git(repository, ["remote", "set-url", "origin", "git@github.com:owner/repo.git"]);
  await git(repository, ["push", "origin", "main"]);
}

async function createAttestFixture(options: { readonly origin?: boolean } = {}): Promise<string> {
  const repository = await createTempRepo();
  await mkdir(join(repository, ".arc", "system"), { recursive: true });
  await writeFile(join(repository, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
  await writeFile(join(repository, "README.md"), "# Fixture\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "base"]);
  await git(repository, ["checkout", "-b", "feat/example"]);
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await mkdir(join(repository, "src"), { recursive: true });
  await writeFile(
    join(repository, ".arc", "active", "meta-example.md"),
    makeMetaFixture("example", {
      owner: "test-user", branch: "feat/example", workClass: "Light", priority: "P2",
      taskList: "tasks-example.md", lastCompleted: "verification",
      nextTask: "Task 1.1 — Verification complete", nextAction: "verification complete",
    }),
  );
  await writeFile(join(repository, "src", "example.ts"), "export const example = true;\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "implementation"]);
  await writeFile(
    join(repository, ".arc", "active", "tasks-example.md"),
    "# Task List: Example\n\n## **Phase 1:** Verification\n\n### `[x]` **1.1 Verification complete**\n",
  );
  await git(repository, ["add", ".arc/active/tasks-example.md"]);
  if (options.origin === true) await attachOrigin(repository);
  return repository;
}

// Every case here holds its meta and task list as tracked files and reads the Candidate evidence attestation stages
// beside them, which only the in-repo store keeps; the store holds them as records, and its cases follow.
describe("arc attest", () => {
  useInRepoStoreForEach();
  let repository: string | null = null;

  afterEach(async () => {
    if (repository !== null) await cleanupTempDir(repository);
  });

  it("writes and stages Candidate evidence while projecting Candidate preparation", async () => {
    repository = await createAttestFixture();

    const result = await runArc(["attest", "example", "--json"], repository);

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "attested",
      operation: "root",
      locus: { locus: "candidate-review-pending", workUnit: "example" },
    });
    const meta = await readFile(join(repository, ".arc", "active", "meta-example.md"), "utf8");
    expect(meta).toContain("| `Active`  | `test-user`");
    expect(meta).toMatch(/- \*\*Candidate:\*\* `sha256:[0-9a-f]{64}`/u);
    expect(meta).toContain("- **Current Workflow:** `prepare-work-unit`");
    expect(meta).toContain("- **Last Completed:** Task 1.1 — Verification complete");
    expect(meta).toContain("- **Next Task:** [none]");
    const record = JSON.parse(await readFile(
      join(repository, ".arc", "system", ".internal", "candidates", "example.json"),
      "utf8",
    )) as { subject: { entries: Array<{ path: string; treatment: string }> } };
    expect(record.subject.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ".arc/active/tasks-example.md", treatment: "evidence-neutral" }),
    ]));
    expect((await git(repository, ["diff", "--cached", "--name-only"])).split("\n").sort()).toEqual([
      ".arc/active/meta-example.md",
      ".arc/active/tasks-example.md",
      ".arc/system/.internal/candidates/example.boundary.json",
      ".arc/system/.internal/candidates/example.json",
    ]);
  });

  it("stages the same Candidate evidence after a base advance sharing none of its paths", async () => {
    repository = await createAttestFixture({ origin: true });
    const advanced = movementPaths("disjoint", "example").base;
    const advance = await advanceBase({ cwd: repository, paths: advanced });
    expect(await git(repository, ["rev-parse", "refs/remotes/origin/main"])).toBe(advance.head);

    const result = await runArc(["attest", "example", "--json"], repository);

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "attested",
      operation: "root",
      locus: { locus: "candidate-review-pending", workUnit: "example" },
    });
    const record = JSON.parse(await readFile(
      join(repository, ".arc", "system", ".internal", "candidates", "example.json"),
      "utf8",
    )) as { subject: { entries: Array<{ path: string; treatment: string }> } };
    expect(record.subject.entries.map((entry) => entry.path).sort()).toEqual([
      ".arc/active/meta-example.md",
      ".arc/active/tasks-example.md",
      "src/example.ts",
    ]);
    expect((await git(repository, ["diff", "--cached", "--name-only"])).split("\n").sort()).toEqual([
      ".arc/active/meta-example.md",
      ".arc/active/tasks-example.md",
      ".arc/system/.internal/candidates/example.boundary.json",
      ".arc/system/.internal/candidates/example.json",
    ]);
  });

  it.each([
    ["an executable task remains open", async (root: string) => {
      await writeFile(
        join(root, ".arc", "active", "tasks-example.md"),
        "# Task List: Example\n\n## **Phase 1:** Verification\n\n### `[ ]` **1.1 Verification open**\n",
      );
    }],
    ["the task list is malformed", async (root: string) => {
      await writeFile(
        join(root, ".arc", "active", "tasks-example.md"),
        "# Task List: Example\n\n- `[x]` **1.1 Invalid root task**\n",
      );
    }],
    ["the task list is missing", async (root: string) => {
      await rm(join(root, ".arc", "active", "tasks-example.md"));
    }],
    ["the metadata carries no task-list binding", async (root: string) => {
      const metaPath = join(root, ".arc", "active", "meta-example.md");
      const meta = await readFile(metaPath, "utf8");
      await writeFile(metaPath, meta.replace("- **Task List:** `tasks-example.md`", "- **Task List:** [none]"));
    }],
  ] as const)("refuses Candidate attestation when %s", async (_label, arrange) => {
    repository = await createAttestFixture();
    await arrange(repository);
    await git(repository, ["add", "-A"]);

    const result = await runArc(["attest", "example", "--json"], repository);

    expect(result.exitCode, JSON.stringify(result)).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "rejected",
      reason: expect.stringMatching(/task[ -]list|task remains open|malformed/iu),
      remedy: { argv: ["arc", "attest", "example"] },
    });
    const meta = await readFile(join(repository, ".arc", "active", "meta-example.md"), "utf8");
    expect(meta).toContain("- **Next Task:** Task 1.1 — Verification complete");
    expect(meta).not.toMatch(/- \*\*Candidate:\*\* `sha256:/u);
    expect(meta).toContain("- **Current Workflow:** [none]");
  });

  it.each([
    ["unstaged tracked content", async (root: string) => {
      await writeFile(join(root, "src", "example.ts"), "export const example = false;\n");
    }, "src/example.ts"],
    ["partially staged content", async (root: string) => {
      await writeFile(join(root, "src", "example.ts"), "export const example = 'staged';\n");
      await git(root, ["add", "src/example.ts"]);
      await writeFile(join(root, "src", "example.ts"), "export const example = 'unstaged';\n");
    }, "src/example.ts"],
    ["untracked reviewable content", async (root: string) => {
      await writeFile(join(root, "src", "untracked.ts"), "export const untracked = true;\n");
    }, "src/untracked.ts"],
  ] as const)("refuses %s that the staged Candidate would omit", async (_label, arrange, expectedPath) => {
    repository = await createAttestFixture();
    await arrange(repository);

    const result = await runArc(["attest", "example", "--json"], repository);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "rejected",
      reason: expect.stringContaining(expectedPath),
      remedy: { argv: ["arc", "attest", "example"] },
    });
  });
});

const CLOSED_TASKS = "# Task List: Example\n\n## **Phase 1:** Verification\n\n### `[x]` **1.1 Verification complete**\n";

describe("arc attest on the store", () => {
  let repository: string | null = null;

  afterEach(async () => {
    if (repository !== null) await cleanupTempDir(repository);
    repository = null;
  });

  /** An Active work unit held in the store and bound in place on its branch, its implementation committed and its
   * task list closed, ready to propose. */
  async function storeFixture(options: { origin?: boolean; taskList?: string | null; bindTaskList?: boolean } = {}) {
    const root = await createTempRepo("arc-attest-store-");
    repository = root;
    const initialized = await runArc(["init", "--yes", "--name", "example"], root);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "chore(test): initialize fixture"]);
    if (options.origin === true) await attachOrigin(root);
    await git(root, ["switch", "-c", "feat/example"]);
    const taskList = options.taskList === undefined ? CLOSED_TASKS : options.taskList;
    const { meta } = await seedWorkUnit(root, "example", { identity: "test-user", branch: "feat/example", bind: root,
      meta: { state: "Active", owner: "test-user", branch: "feat/example", workClass: "Light", priority: "P2",
        ...(options.bindTaskList === false ? {} : { taskList: "tasks-example.md" }), lastCompleted: "verification",
        nextTask: "Task 1.1 — Verification complete", nextAction: "verification complete" },
      ...(taskList === null ? {} : { taskList }) });
    await writeFile(join(root, ".git", "info", "exclude"), ".arc/system/.internal/worktree-marker.json\n", { flag: "a" });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "example.ts"), "export const example = true;\n");
    await git(root, ["add", "src/example.ts"]);
    await git(root, ["commit", "-m", "implementation"]);
    const read = (reference: RecordReference = meta.reference) => readStoreRecord(root, SlugSchema.parse("test-user"), reference);
    return { root, meta, read, candidate: recordReferences["review/candidate"](meta.reference.owner) };
  }

  // The store takes Candidate authority from the Candidate record alone, and from the flip no verb writes the meta's
  // Next Task or Last Completed, so attestation moves only the meta's workflow and next action.
  it("writes the Candidate record and moves the meta to Candidate preparation, staging nothing", async () => {
    const f = await storeFixture();

    const result = await runArc(["attest", "example", "--json"], f.root);

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "attested",
      operation: "root",
      locus: { locus: "candidate-review-pending", workUnit: "example" },
    });
    expect(await f.read()).toMatchObject({ fields: { state: "Active", candidateId: null, currentWorkflow: "prepare-work-unit",
      lastCompleted: "verification", nextTask: "Task 1.1 — Verification complete" } });
    const record = JSON.parse((await f.read(f.candidate) as { content: string }).content) as {
      subject: { entries: Array<{ path: string }> } };
    expect(record.subject.entries.map((entry) => entry.path)).toEqual(["src/example.ts"]);
    expect(await git(f.root, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("proposes the same Candidate subject after a base advance sharing none of its paths", async () => {
    const f = await storeFixture({ origin: true });
    const advance = await advanceBase({ cwd: f.root, paths: movementPaths("disjoint", "example").base });
    expect(await git(f.root, ["rev-parse", "refs/remotes/origin/main"])).toBe(advance.head);

    const result = await runArc(["attest", "example", "--json"], f.root);

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "attested", operation: "root" });
    const record = JSON.parse((await f.read(f.candidate) as { content: string }).content) as {
      subject: { entries: Array<{ path: string }> } };
    expect(record.subject.entries.map((entry) => entry.path)).toEqual(["src/example.ts"]);
    expect(await git(f.root, ["diff", "--cached", "--name-only"])).toBe("");
  });

  // The store refuses to hold a malformed task list, so attestation never reads one there.
  it.each([
    ["an executable task remains open", { taskList: CLOSED_TASKS.replace("`[x]`", "`[ ]`") }],
    ["the metadata carries no task-list binding", { bindTaskList: false }],
  ] as const)("refuses Candidate attestation when %s, writing nothing", async (_label, options) => {
    const f = await storeFixture(options);
    const before = await f.read();

    const result = await runArc(["attest", "example", "--json"], f.root);

    expect(result.exitCode, JSON.stringify(result)).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "rejected",
      reason: expect.stringMatching(/task[ -]list|task remains open|malformed/iu),
      remedy: { argv: ["arc", "attest", "example"] },
    });
    expect(await f.read()).toEqual(before);
    await expect(f.read(f.candidate)).rejects.toThrow(/not-found/u);
  });

  it("refuses Candidate attestation when the task list is missing, writing nothing", async () => {
    const f = await storeFixture({ taskList: null });
    const before = await f.read();

    const result = await runArc(["attest", "example", "--json"], f.root);

    expect(result.exitCode, JSON.stringify(result)).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "rejected" });
    expect(await f.read()).toEqual(before);
    await expect(f.read(f.candidate)).rejects.toThrow(/not-found/u);
  });

  it.each([
    ["unstaged tracked content", async (root: string) => {
      await writeFile(join(root, "src", "example.ts"), "export const example = false;\n");
    }, "src/example.ts"],
    ["partially staged content", async (root: string) => {
      await writeFile(join(root, "src", "example.ts"), "export const example = 'staged';\n");
      await git(root, ["add", "src/example.ts"]);
      await writeFile(join(root, "src", "example.ts"), "export const example = 'unstaged';\n");
    }, "src/example.ts"],
    ["untracked reviewable content", async (root: string) => {
      await writeFile(join(root, "src", "untracked.ts"), "export const untracked = true;\n");
    }, "src/untracked.ts"],
  ] as const)("refuses %s the Candidate would omit, writing nothing", async (_label, arrange, expectedPath) => {
    const f = await storeFixture();
    await arrange(f.root);
    const before = await f.read();

    const result = await runArc(["attest", "example", "--json"], f.root);

    expect(result.exitCode, JSON.stringify(result)).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "rejected",
      reason: expect.stringContaining(expectedPath),
      remedy: { argv: ["arc", "attest", "example"] },
    });
    expect(await f.read()).toEqual(before);
  });
});
