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
    [
      "# Metadata: example",
      "",
      "| **State** | **Owner**   | **Branch**     | **Class** | **Priority** |",
      "| --------- | ----------- | -------------- | --------- | ------------ |",
      "| `Active`  | `test-user` | `feat/example` | `Light`   | `P2`         |",
      "",
      "- **Cohort:** [none]",
      "- **Depends On:** [none]",
      "",
      "- **Origin:** [internal]",
      "- **Design:** [none]",
      "- **Task List:** `tasks-example.md`",
      "- **Review Rubric:** [none]",
      "- **Promotion Receipt:** [none]",
      "",
      "- **Current Workflow:** [none]",
      "- **Last Completed:** verification",
      "- **Next Task:** Task 1.1 — Verification complete",
      "- **Blockers:** [none]",
      "",
      "- **Next Action:** verification complete",
      "",
      "- **PR URL:** [none]",
      "- **Completed:** [none]",
      "",
      "---",
      "",
    ].join("\n"),
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

describe("arc attest", () => {
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
