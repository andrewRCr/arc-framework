/**
 * Real-CLI coverage for the publication spine's first-call path.
 *
 * `propose → pre-publication → submit` is proven by execution rather than by injected dependencies:
 * the durable boundary the middle verb writes is the one submission reads, and `arc submit`
 * succeeds on its first call over it.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
} from "./helpers.js";

/**
 * Origin coordinates that parse as `owner/repo` but reach no host.
 *
 * The change-request resolver needs the repository name; `.invalid` is reserved by RFC 2606, so the
 * ref probe fails at name resolution rather than over the network. The resolver classifies the
 * unreachable host as no open change request — the pre-publication state under test.
 */
const OFFLINE_ORIGIN = "https://arc-fixture.invalid/arc-framework/example.git";
const OFFLINE_ENV = { GIT_TERMINAL_PROMPT: "0" };

const META = [
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
].join("\n");

/** Stage one verified Active work unit on its own branch, ready to propose. */
async function createProposableRepo(): Promise<string> {
  const repository = await createTempRepo();
  await mkdir(join(repository, ".arc", "system"), { recursive: true });
  await writeFile(join(repository, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
  await writeFile(join(repository, "README.md"), "# Fixture\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "base"]);
  await git(repository, ["remote", "add", "origin", OFFLINE_ORIGIN]);
  await git(repository, ["checkout", "-b", "feat/example"]);
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await mkdir(join(repository, "src"), { recursive: true });
  await writeFile(join(repository, ".arc", "active", "meta-example.md"), META);
  await writeFile(join(repository, "src", "example.ts"), "export const example = true;\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "implementation"]);
  await writeFile(
    join(repository, ".arc", "active", "tasks-example.md"),
    "# Task List: Example\n\n- [x] Verification complete\n",
  );
  await git(repository, ["add", ".arc/active/tasks-example.md"]);
  return repository;
}

describe("propose → pre-publication → submit", () => {
  let repository: string | null = null;

  afterEach(async () => {
    if (repository !== null) await cleanupTempDir(repository);
  });

  it("settles the boundary at pre-publication and submits on the first call", async () => {
    repository = await createProposableRepo();

    const proposed = await runArc(["propose", "example", "--json"], repository);
    expect(proposed.exitCode, JSON.stringify(proposed)).toBe(0);
    expect(JSON.parse(proposed.stdout)).toMatchObject({
      status: "attested",
      locus: {
        kind: "candidate-review-pending",
        nextAction: { command: "arc review pre-publication example --json" },
      },
    });

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled", "--json"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    const envelope = JSON.parse(reviewed.stdout) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      mode: "pre-publication-review",
      workUnit: "example",
      locus: "candidate-submit-ready",
      nextAction: { kind: "submit-candidate", command: "arc submit example --json" },
    });

    const boundaryPath = join(
      ".arc", "system", ".internal", "candidates", "example.boundary.json",
    );
    const boundary = JSON.parse(await readFile(join(repository, boundaryPath), "utf8")) as {
      locus: string;
      candidateId: string;
    };
    expect(boundary.locus).toBe("candidate-submit-ready");
    expect(boundary.candidateId).toBe(envelope.candidateId);
    expect((await git(repository, ["diff", "--cached", "--name-only"])).split("\n"))
      .toContain(boundaryPath.split("\\").join("/"));

    const submitted = await runArc(
      [
        "submit", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
        "--json",
      ],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(submitted.exitCode, JSON.stringify(submitted)).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      status: "submitted",
      boundary: { locus: "publication-pending", candidateId: envelope.candidateId },
    });
    expect(await readFile(join(repository, ".arc", "active", "meta-example.md"), "utf8"))
      .toContain("| `Integrating` | `test-user`");

    // Submission advanced the boundary past its settle point; repeating reports the resume point
    // rather than re-firing the transition.
    const repeated = await runArc(
      [
        "submit", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
        "--json",
      ],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(repeated.exitCode, JSON.stringify(repeated)).toBe(0);
    expect(JSON.parse(repeated.stdout)).toMatchObject({
      status: "unchanged",
      boundary: { locus: "publication-pending" },
    });
  });

  it("refuses submission while a pre-publication obligation is still open", async () => {
    repository = await createProposableRepo();
    expect((await runArc(["propose", "example", "--json"], repository)).exitCode).toBe(0);

    // Self-review is active by package default, so the bare procedure stops before settling and
    // writes no boundary — which is the only state submission's refusal can now mean.
    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--json"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    expect(JSON.parse(reviewed.stdout)).toMatchObject({
      locus: "candidate-review-pending",
      nextAction: { kind: "run-self-review" },
    });

    const submitted = await runArc(
      [
        "submit", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
      ],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(submitted.exitCode).not.toBe(0);
    expect(`${submitted.stdout}${submitted.stderr}`).toContain("no durable pre-publication boundary");
  });
});
