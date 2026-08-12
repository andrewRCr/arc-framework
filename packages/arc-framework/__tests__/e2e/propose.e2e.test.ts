/** Real-CLI coverage for Candidate proposal publication. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
} from "./helpers.js";

describe("arc propose", () => {
  let repository: string | null = null;

  afterEach(async () => {
    if (repository !== null) await cleanupTempDir(repository);
  });

  it("writes and stages Candidate evidence without changing Active scheduling", async () => {
    repository = await createTempRepo();
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
        "- **Next Task:** [none]",
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
      "# Task List: Example\n\n- [x] Verification complete\n",
    );
    await git(repository, ["add", ".arc/active/tasks-example.md"]);

    const result = await runArc(["propose", "example", "--json"], repository);

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "attested",
      operation: "root",
      locus: { kind: "candidate-review-pending", workUnit: "example" },
    });
    const meta = await readFile(join(repository, ".arc", "active", "meta-example.md"), "utf8");
    expect(meta).toContain("| `Active`  | `test-user`");
    expect(meta).toMatch(/- \*\*Candidate:\*\* `sha256:[0-9a-f]{64}`/u);
    const record = JSON.parse(await readFile(
      join(repository, ".arc", "system", ".internal", "candidates", "example.json"),
      "utf8",
    )) as { subject: { entries: Array<{ path: string; treatment: string }> } };
    expect(record.subject.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ".arc/active/tasks-example.md", treatment: "reviewable" }),
    ]));
    expect((await git(repository, ["diff", "--cached", "--name-only"])).split("\n").sort()).toEqual([
      ".arc/active/meta-example.md",
      ".arc/active/tasks-example.md",
      ".arc/system/.internal/candidates/example.json",
    ]);
  });
});
