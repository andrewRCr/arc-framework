import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, git, runArc } from "./store-default.js";
import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    .map(([key, member]) => `${JSON.stringify(key)}:${canonicalize(member)}`)
    .join(",")}}`;
}

function meta(slug: string, branch: string, dependsOn: string): string {
  return [
    `# Metadata: ${slug}`,
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    `| Active | test-user | \`${branch}\` | — | — |`,
    "",
    `- **Depends On:** ${dependsOn}`,
    "",
    "---",
    "",
  ].join("\n");
}

// Every case here reconciles state the in-repo store keeps in tracked files: metas, specs, and notes staged in the
// checkout, transition records that reach a branch by merge, a sibling worktree's own copy, an archived meta on its
// branch, personal notes and their baseline, or a base tree read under full protection; or it needs no identity because
// it only stages. The store rewrites records in one attributed write, and its cases follow.
describe("arc wu reconcile", () => {
  useInRepoStoreForEach();
  let repo: string;
  let transitionPath: string;
  let transitionRelativePath: string;
  let transitionContent: string;

  beforeEach(async () => {
    repo = await createTempRepo("arc-wu-reconcile-");
    const active = join(repo, ".arc", "active");
    const planned = join(repo, ".arc", "backlog", "planned");
    const transitions = join(repo, ".arc", "system", ".internal", "transitions");
    await mkdir(active, { recursive: true });
    await mkdir(planned, { recursive: true });
    await mkdir(transitions, { recursive: true });
    await writeFile(
      join(active, "meta-dependent.md"),
      meta("dependent", "main", "`origin`"),
      "utf8",
    );
    await writeFile(
      join(planned, "meta-successor.md"),
      meta("successor", "[none]", "[none]").replace("| Active |", "| Planning |"),
      "utf8",
    );
    transitionRelativePath = join(".arc", "system", ".internal", "transitions", "origin.json");
    transitionPath = join(repo, transitionRelativePath);
    transitionContent = canonicalize({
      schemaVersion: 2,
      origin: { name: "origin" },
      kind: "rename",
      successors: [{ name: "successor" }],
      incoming: [],
    });
    await writeFile(transitionPath, transitionContent, "utf8");
    await git(repo, ["add", "--all"]);
    await git(repo, ["commit", "-m", "fixture"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repo);
  });

  it("plans without writing, then applies and stages only the owned meta", async () => {
    const metaPath = join(repo, ".arc", "active", "meta-dependent.md");
    const before = await readFile(metaPath, "utf8");

    const planned = await runArc(["wu", "reconcile", "dependent", "--json"], repo);
    expect(planned.exitCode).toBe(0);
    expect(JSON.parse(planned.stdout)).toMatchObject({
      status: "pending",
      slug: "dependent",
      dependency: { before: ["origin"], after: ["successor"] },
    });
    expect(await readFile(metaPath, "utf8")).toBe(before);

    const applied = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], repo);
    expect(applied.exitCode).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({
      status: "applied",
      stagedPaths: [".arc/active/meta-dependent.md"],
    });
    expect(await readFile(metaPath, "utf8")).toContain("- **Depends On:** `successor`");
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe(".arc/active/meta-dependent.md");
  });

  it("applies without an identity because reconciliation is checkout-owned", async () => {
    await git(repo, ["config", "--unset", "arc.identity"]);
    await git(repo, ["config", "--unset", "user.name"]);
    const metaPath = join(repo, ".arc", "active", "meta-dependent.md");

    const result = await runArc(
      ["wu", "reconcile", "dependent", "--apply", "--json"],
      repo,
      {
        env: {
          GIT_CONFIG_GLOBAL: join(repo, "missing-global-gitconfig"),
          GIT_CONFIG_NOSYSTEM: "1",
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "applied", slug: "dependent" });
    expect(await readFile(metaPath, "utf8")).toContain("- **Depends On:** `successor`");
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe(".arc/active/meta-dependent.md");
  });

  it("surfaces and applies reference-only reconcile through the shared command", async () => {
    const metaPath = join(repo, ".arc", "active", "meta-dependent.md");
    const specPath = join(repo, ".arc", "active", "spec-dependent.md");
    await writeFile(metaPath, meta("dependent", "main", "[none]"), "utf8");
    await writeFile(specPath, "See `spec-origin.md`; origin remains narrative context.\n", "utf8");
    await git(repo, ["add", "--all"]);
    await git(repo, ["commit", "-m", "reference-only dependent"]);
    const before = await readFile(specPath, "utf8");

    const planned = await runArc(["wu", "reconcile", "dependent", "--json"], repo);
    expect(planned.exitCode).toBe(0);
    expect(JSON.parse(planned.stdout)).toMatchObject({
      status: "pending",
      dependency: { before: [], after: [] },
      trackedReferences: {
        edits: [{
          path: ".arc/active/spec-dependent.md",
          replacements: [{ subject: "origin", targetSlug: "successor" }],
        }],
      },
      advisories: [{
        path: ".arc/active/spec-dependent.md",
        referenceKind: "narrative",
        subject: "origin",
        suggestedDisposition: "review-rename",
      }],
    });
    expect(await readFile(specPath, "utf8")).toBe(before);

    const status = await runArc(["status", "--session-init", "--json"], repo);
    expect(status.exitCode).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      currentWuReconcile: {
        ok: true,
        value: {
          status: "pending",
          recommendedCommand: [
            "arc",
            "wu",
            "reconcile",
            "dependent",
            "--apply",
            "--json",
          ],
          recommendedPromptText: expect.stringContaining(
            "arc wu reconcile dependent --apply --json",
          ),
        },
      },
    });
    expect(await readFile(specPath, "utf8")).toBe(before);

    const applied = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], repo);
    expect(applied.exitCode).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({
      status: "applied",
      stagedPaths: [".arc/active/spec-dependent.md"],
    });
    expect(await readFile(specPath, "utf8")).toBe(
      "See `spec-successor.md`; origin remains narrative context.\n",
    );
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe(
      ".arc/active/spec-dependent.md",
    );
  });

  it("keeps advisory-only apply pending and visible in human output", async () => {
    const metaPath = join(repo, ".arc", "active", "meta-dependent.md");
    const notesPath = join(repo, ".arc", "active", "notes-dependent.md");
    await writeFile(metaPath, meta("dependent", "main", "[none]"), "utf8");
    await writeFile(notesPath, "The origin remains narrative context.\n", "utf8");
    await git(repo, ["add", "--all"]);
    await git(repo, ["commit", "-m", "advisory-only dependent"]);

    const json = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], repo);
    expect(json.exitCode).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({
      status: "pending",
      edits: [],
      stagedPaths: [],
      advisories: [expect.objectContaining({
        path: ".arc/active/notes-dependent.md",
        referenceKind: "narrative",
        subject: "origin",
      })],
    });

    const human = await runArc(["wu", "reconcile", "dependent", "--apply"], repo);
    expect(human.exitCode).toBe(0);
    expect(human.stdout + human.stderr).toMatch(/Pending reconcile[\s\S]*1 advisory finding/u);
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("surfaces a pending session reconcile without writing tracked state", async () => {
    const metaPath = join(repo, ".arc", "active", "meta-dependent.md");
    const beforeMeta = await readFile(metaPath, "utf8");
    const beforeStatus = await git(repo, ["status", "--porcelain"]);

    const result = await runArc(["status", "--session-init", "--json"], repo);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      currentWuReconcile: {
        ok: true,
        value: {
          status: "pending",
          slug: "dependent",
          recommendedAction: "surface",
        },
      },
    });
    expect(await readFile(metaPath, "utf8")).toBe(beforeMeta);
    expect(await git(repo, ["status", "--porcelain"])).toBe(beforeStatus);
  });

  it("rechecks transition evidence that appears after the dependent entered integration", async () => {
    const metaPath = join(repo, ".arc", "active", "meta-dependent.md");
    await writeFile(
      metaPath,
      meta("dependent", "main", "`origin`").replace("| Active |", "| Integrating |"),
      "utf8",
    );
    await git(repo, ["rm", transitionRelativePath]);
    await git(repo, ["add", ".arc/active/meta-dependent.md"]);
    await git(repo, ["commit", "-m", "enter integration before transition"]);

    const blocked = await runArc(["status", "--session-init", "--json"], repo);
    expect(blocked.exitCode).toBe(0);
    expect(JSON.parse(blocked.stdout)).toMatchObject({
      currentWuReconcile: {
        ok: true,
        value: { status: "conflict", reason: "missing-evidence" },
      },
    });

    await mkdir(join(repo, ".arc", "system", ".internal", "transitions"), { recursive: true });
    await writeFile(transitionPath, transitionContent, "utf8");
    await git(repo, ["add", transitionRelativePath]);
    await git(repo, ["commit", "-m", "merge transition evidence"]);
    const applied = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], repo);

    expect(applied.exitCode).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({
      status: "applied",
      dependency: { before: ["origin"], after: ["successor"] },
    });
  });

  it("refuses to write a work unit owned by another branch", async () => {
    const dependentPath = join(repo, ".arc", "active", "meta-dependent.md");
    const successorPath = join(repo, ".arc", "backlog", "planned", "meta-successor.md");
    const beforeDependent = await readFile(dependentPath, "utf8");
    const beforeSuccessor = await readFile(successorPath, "utf8");

    const result = await runArc(["wu", "reconcile", "successor", "--apply", "--json"], repo);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "conflict",
      slug: "successor",
      reason: "work unit `successor` is not owned by branch `main`",
    });
    expect(await readFile(dependentPath, "utf8")).toBe(beforeDependent);
    expect(await readFile(successorPath, "utf8")).toBe(beforeSuccessor);
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("leaves another worktree byte-identical until its own reconcile ceremony", async () => {
    const sibling = await mkdtemp(join(tmpdir(), "arc-wu-reconcile-sibling-"));
    await git(repo, ["worktree", "add", "-b", "feat/sibling", sibling]);
    try {
      const siblingMeta = join(sibling, ".arc", "active", "meta-dependent.md");
      const before = await readFile(siblingMeta, "utf8");

      const result = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], repo);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ status: "applied" });
      expect(await readFile(siblingMeta, "utf8")).toBe(before);
      expect(await git(sibling, ["status", "--porcelain"])).toBe("");
      const lociRoot = join(repo, ".arc", "user", "test-user", ".internal", "loci");
      await expect(readdir(lociRoot)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await git(repo, ["worktree", "remove", "--force", sibling]);
    }
  });

  it("reconciles managed user targets without advancing notes or the materialized baseline", async () => {
    const userRoot = join(repo, ".arc", "user", "test-user");
    const sessionRoot = join(userRoot, "dependent");
    const inboxPath = join(userRoot, "USER-INBOX.md");
    const workingMemoryPath = join(userRoot, "WORKING-MEMORY.md");
    const sessionNotesPath = join(sessionRoot, "SESSION-NOTES.md");
    await mkdir(sessionRoot, { recursive: true });
    await writeFile(
      inboxPath,
      "# User Inbox\n\n## Errand\n\n## Work Unit\n\n"
      + "### `[ ]` **Target**\n\n- _WU_Target:_ `origin (provisional)`\n\n---\n",
      "utf8",
    );
    await writeFile(workingMemoryPath, "# Working Memory\n\n## Memories\n\norigin prose\n", "utf8");
    await writeFile(sessionNotesPath, "# Session Notes\n\norigin prose\n", "utf8");
    const saved = await runArc(["user", "save"], repo);
    expect(saved.exitCode).toBe(0);
    const notesRef = "refs/notes/arc/user/test-user";
    const notesBefore = await git(repo, ["rev-parse", notesRef]);
    const baselinePath = join(
      repo,
      ".git",
      "arc",
      "user",
      "test-user",
      ".internal",
      "materialized-baseline.json",
    );
    const baselineBefore = await readFile(baselinePath, "utf8");
    const workingBefore = await readFile(workingMemoryPath, "utf8");
    const sessionBefore = await readFile(sessionNotesPath, "utf8");

    const sessionStatus = await runArc(["status", "--session-init", "--json"], repo);
    expect(sessionStatus.exitCode).toBe(0);
    expect(JSON.parse(sessionStatus.stdout)).toMatchObject({
      userReferenceReconcile: {
        ok: true,
        value: {
          status: "pending",
          recommendedAction: "apply",
          recommendedCommand: [
            "arc",
            "user",
            "reconcile-references",
            "--apply",
            "--json",
          ],
        },
      },
    });
    expect(await readFile(inboxPath, "utf8")).toContain("- _WU_Target:_ `origin (provisional)`");

    const inspected = await runArc(["user", "reconcile-references", "--json"], repo);
    expect(inspected.exitCode).toBe(0);
    expect(JSON.parse(inspected.stdout)).toMatchObject({
      status: "pending",
      authority: { status: "ready", ref: "main" },
      plan: {
        edits: [{
          replacements: [{ subject: "origin", targetSlug: "successor" }],
        }],
        advisories: expect.arrayContaining([
          expect.objectContaining({ path: expect.stringContaining("WORKING-MEMORY.md") }),
          expect.objectContaining({ path: expect.stringContaining("SESSION-NOTES.md") }),
        ]),
      },
      recommendedCommand: [
        "arc",
        "user",
        "reconcile-references",
        "--apply",
        "--json",
      ],
    });
    expect(await readFile(inboxPath, "utf8")).toContain("- _WU_Target:_ `origin (provisional)`");

    const applied = await runArc(
      ["user", "reconcile-references", "--apply", "--json"],
      repo,
    );
    expect(applied.exitCode).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({ status: "applied" });
    expect(await readFile(inboxPath, "utf8")).toContain("- _WU_Target:_ `successor (provisional)`");
    expect(await readFile(workingMemoryPath, "utf8")).toBe(workingBefore);
    expect(await readFile(sessionNotesPath, "utf8")).toBe(sessionBefore);
    expect(await git(repo, ["rev-parse", notesRef])).toBe(notesBefore);
    expect(await readFile(baselinePath, "utf8")).toBe(baselineBefore);

    const drift = await runArc(["user", "status", "--offline", "--json"], repo);
    expect(drift.exitCode).toBe(0);
    expect(JSON.parse(drift.stdout)).toMatchObject({ diskState: "different" });
  });

  it("exits without a plan when full-protection base materialization fails", async () => {
    const configRoot = join(repo, ".arc", "system");
    await mkdir(configRoot, { recursive: true });
    await writeFile(
      join(configRoot, "arc-config.yml"),
      "branch.base: main\nbranch.protection: full\n",
      "utf8",
    );

    const result = await runArc(["user", "reconcile-references", "--json"], repo);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      status: "unavailable",
      authority: {
        status: "unavailable",
        ref: "origin/main",
        remoteEvidence: "unreachable",
        failureReason: "error",
      },
      plan: null,
      recommendedCommand: null,
    });
  });

  it("keeps a clean checkout-owned reconcile silent without minting a locus record", async () => {
    const metaPath = join(repo, ".arc", "active", "meta-dependent.md");
    const lociRoot = join(repo, ".arc", "user", "test-user", ".internal", "loci");
    await writeFile(metaPath, meta("dependent", "main", "[none]"), "utf8");
    await git(repo, ["add", "--all"]);
    await git(repo, ["commit", "-m", "clear dependency"]);
    const before = await readFile(metaPath, "utf8");
    const beforeHead = await git(repo, ["rev-parse", "HEAD"]);

    const status = await runArc(["status", "--session-init", "--json"], repo);

    expect(status.exitCode).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      currentWuReconcile: {
        ok: true,
        value: {
          status: "clean",
          recommendedAction: "skip",
          recommendedCommand: null,
          recommendedPromptText: "",
        },
      },
    });
    await expect(readdir(lociRoot)).rejects.toMatchObject({ code: "ENOENT" });

    const applied = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], repo);

    expect(applied.exitCode).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({
      status: "clean",
      stagedPaths: [],
    });
    await expect(readdir(lociRoot)).rejects.toMatchObject({ code: "ENOENT" });

    const replay = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], repo);

    expect(replay.exitCode).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({ status: "clean", stagedPaths: [] });
    await expect(readdir(lociRoot)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(metaPath, "utf8")).toBe(before);
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await git(repo, ["rev-parse", "HEAD"])).toBe(beforeHead);
  });

  it("reconciles an archived integration candidate from its conventional WU branch", async () => {
    await git(repo, ["switch", "-c", "feat/dependent"]);
    const completed = join(repo, ".arc", "completed", "2026", "dependent");
    await mkdir(completed, { recursive: true });
    const activePath = join(repo, ".arc", "active", "meta-dependent.md");
    const completedPath = join(completed, "meta-dependent.md");
    await writeFile(
      completedPath,
      meta("dependent", "[none]", "`origin`").replace("| Active |", "| Shipped |"),
      "utf8",
    );
    await git(repo, ["rm", ".arc/active/meta-dependent.md"]);
    await git(repo, ["add", ".arc/completed/2026/dependent/meta-dependent.md"]);
    await git(repo, ["commit", "-m", "archive candidate"]);

    const result = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], repo);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "applied",
      slug: "dependent",
      stagedPaths: [".arc/completed/2026/dependent/meta-dependent.md"],
    });
    expect(await readFile(completedPath, "utf8")).toContain("- **Depends On:** `successor`");
    await expect(readFile(activePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("arc wu reconcile on the store", () => {
  let repo: string | undefined;
  afterEach(async () => { if (repo !== undefined) await cleanupTempDir(repo); repo = undefined; });

  /** `dependent`, Active in the store and bound to the primary on its branch, depends on `origin`, a backlog stub since
   * renamed `successor` through the store. */
  async function storeFixture(options: { dependsOn?: string[]; records?: { kind: "work-item/spec" | "work-item/notes"; content: string }[] } = {}) {
    repo = await createTempRepo("arc-wu-reconcile-store-");
    const initialized = await runArc(["init", "--yes", "--name", "reconcile-test"], repo);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    await git(repo, ["config", "core.hooksPath", "/dev/null"]);
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "chore(test): initialize fixture"]);
    const stubbed = await runArc(["stub", "origin", "--commitment", "planned", "--priority", "P2", "--class", "Light"], repo);
    expect(stubbed.exitCode, stubbed.stdout + stubbed.stderr).toBe(0);
    await git(repo, ["switch", "-c", "feat/dependent"]);
    const { meta, records } = await seedWorkUnit(repo, "dependent", { identity: "test-user", branch: "feat/dependent", bind: repo,
      meta: { state: "Active", owner: "test-user", branch: "feat/dependent", dependsOn: options.dependsOn ?? ["origin"] },
      ...(options.records === undefined ? {} : { records: options.records }) });
    await writeFile(join(repo, ".git", "info", "exclude"), ".arc/system/.internal/worktree-marker.json\n", { flag: "a" });
    const renamed = await runArc(["rename", "origin", "successor"], repo);
    expect(renamed.exitCode, renamed.stdout + renamed.stderr).toBe(0);
    const read = (reference = meta.reference) => readStoreRecord(repo as string, SlugSchema.parse("test-user"), reference);
    return { repo, meta, records, read };
  }

  it("rejects the retired session-attachment option", async () => {
    repo = await createTempRepo("arc-wu-reconcile-store-");

    const result = await runArc(["wu", "reconcile", "dependent", "--attach-session", "--json"], repo);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/unknown option '--attach-session'/u);
  });

  it("plans without writing, then applies the renamed dependency in one store write, staging nothing", async () => {
    const f = await storeFixture();
    const before = await f.read();

    const planned = await runArc(["wu", "reconcile", "dependent", "--json"], f.repo);
    expect(planned.exitCode, planned.stdout + planned.stderr).toBe(0);
    expect(JSON.parse(planned.stdout)).toMatchObject({
      status: "pending",
      slug: "dependent",
      dependency: { before: ["origin"], after: ["successor"] },
    });
    expect(await f.read()).toEqual(before);

    const applied = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], f.repo);
    expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({ status: "applied", stagedPaths: [] });
    expect(await f.read()).toMatchObject({ fields: { dependsOn: ["successor"] } });
    expect(await git(f.repo, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await git(f.repo, ["status", "--porcelain"])).toBe("");
  }, 30_000);

  it("surfaces a pending session reconcile without writing", async () => {
    const f = await storeFixture();
    const before = await f.read();

    const result = await runArc(["status", "--session-init", "--json"], f.repo);

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      currentWuReconcile: { ok: true, value: { status: "pending", slug: "dependent", recommendedAction: "surface" } },
    });
    expect(await f.read()).toEqual(before);
    expect(await git(f.repo, ["status", "--porcelain"])).toBe("");
  }, 30_000);

  it("refuses to write a work unit the checkout does not hold", async () => {
    const f = await storeFixture();
    const before = await f.read();

    const result = await runArc(["wu", "reconcile", "successor", "--apply", "--json"], f.repo);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "conflict",
      slug: "successor",
      reason: "The requested work unit does not match the checkout's work-unit identity.",
    });
    expect(await f.read()).toEqual(before);
    expect(await git(f.repo, ["diff", "--cached", "--name-only"])).toBe("");
  }, 30_000);

  it("keeps a clean reconcile silent without minting a locus record", async () => {
    const f = await storeFixture({ dependsOn: [] });
    const lociRoot = join(f.repo, ".arc", "user", "test-user", ".internal", "loci");
    const before = await f.read();
    const beforeHead = await git(f.repo, ["rev-parse", "HEAD"]);

    const status = await runArc(["status", "--session-init", "--json"], f.repo);

    expect(status.exitCode, status.stdout + status.stderr).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      currentWuReconcile: {
        ok: true,
        value: { status: "clean", recommendedAction: "skip", recommendedCommand: null, recommendedPromptText: "" },
      },
    });
    for (let run = 0; run < 2; run += 1) {
      const applied = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], f.repo);
      expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
      expect(JSON.parse(applied.stdout)).toMatchObject({ status: "clean", stagedPaths: [] });
    }
    await expect(readdir(lociRoot)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await f.read()).toEqual(before);
    expect(await git(f.repo, ["rev-parse", "HEAD"])).toBe(beforeHead);
  }, 30_000);

  it("rewrites a reference in the work unit's spec record through the shared command", async () => {
    const f = await storeFixture({ dependsOn: [],
      records: [{ kind: "work-item/spec", content: "See `spec-origin.md`; origin remains narrative context.\n" }] });
    const spec = f.records[0]?.reference;
    if (spec === undefined) throw new Error("The fixture holds no spec record.");
    const before = await f.read(spec);

    const planned = await runArc(["wu", "reconcile", "dependent", "--json"], f.repo);
    expect(planned.exitCode, planned.stdout + planned.stderr).toBe(0);
    expect(JSON.parse(planned.stdout)).toMatchObject({
      status: "pending",
      dependency: { before: [], after: [] },
      trackedReferences: { edits: [{
        path: ".arc/active/current/spec-dependent.md",
        replacements: [{ subject: "origin", targetSlug: "successor" }],
      }] },
      advisories: [{
        path: ".arc/active/current/spec-dependent.md",
        referenceKind: "narrative",
        subject: "origin",
        suggestedDisposition: "review-rename",
      }],
    });
    expect(await f.read(spec)).toEqual(before);

    const applied = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], f.repo);
    expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({ status: "applied", stagedPaths: [] });
    expect(await f.read(spec)).toMatchObject({ content: "See `spec-successor.md`; origin remains narrative context.\n" });
    expect(await git(f.repo, ["diff", "--cached", "--name-only"])).toBe("");
  }, 30_000);

  it("keeps advisory-only apply pending and visible in human output", async () => {
    const f = await storeFixture({ dependsOn: [],
      records: [{ kind: "work-item/notes", content: "The origin remains narrative context.\n" }] });
    const notes = f.records[0]?.reference;
    if (notes === undefined) throw new Error("The fixture holds no notes record.");
    const before = await f.read(notes);

    const json = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], f.repo);
    expect(json.exitCode, json.stdout + json.stderr).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({
      status: "pending",
      edits: [],
      stagedPaths: [],
      advisories: [expect.objectContaining({
        path: ".arc/active/current/notes-dependent.md",
        referenceKind: "narrative",
        subject: "origin",
      })],
    });

    const human = await runArc(["wu", "reconcile", "dependent", "--apply"], f.repo);
    expect(human.exitCode).toBe(0);
    expect(human.stdout + human.stderr).toMatch(/Pending reconcile[\s\S]*1 advisory finding/u);
    expect(await f.read(notes)).toEqual(before);
  }, 30_000);
});
