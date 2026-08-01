import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, git, runArc, runArcAnchored } from "./helpers.js";

const DIGEST = `sha256:${"0".repeat(64)}`;

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    .map(([key, member]) => `${JSON.stringify(key)}:${canonicalize(member)}`)
    .join(",")}}`;
}

function canonicalDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalize(value)).digest("hex")}`;
}

function meta(slug: string, branch: string, dependsOn: string): string {
  return `# Metadata: ${slug}\n\n`
    + "- **State:** Active\n"
    + `- **Branch:** \`${branch}\`\n`
    + `- **Depends On:** ${dependsOn}\n`;
}

describe("arc wu reconcile", () => {
  let repo: string;
  let receiptPath: string;
  let receiptRelativePath: string;
  let receiptContent: string;

  beforeEach(async () => {
    repo = await createTempRepo("arc-wu-reconcile-");
    const active = join(repo, ".arc", "active");
    const planned = join(repo, ".arc", "backlog", "planned");
    const records = join(repo, ".arc", "system", ".internal", "retirement-receipts");
    await mkdir(active, { recursive: true });
    await mkdir(planned, { recursive: true });
    await mkdir(records, { recursive: true });
    await writeFile(
      join(active, "meta-dependent.md"),
      meta("dependent", "main", "`origin`"),
      "utf8",
    );
    await writeFile(
      join(planned, "meta-successor.md"),
      meta("successor", "[none]", "[none]").replace("- **State:** Active", "- **State:** Planning"),
      "utf8",
    );
    const subject = { kind: "work-unit", name: "origin" };
    const source = { branch: "feat/origin", head: "a".repeat(40), artifactDigest: DIGEST };
    const receiptId = canonicalDigest({
      schemaVersion: 1,
      subject,
      transition: "rename",
      sourceBranch: source.branch,
      sourceHead: source.head,
    });
    const receipt = {
      schemaVersion: 1,
      receiptId,
      subject,
      transition: "rename",
      source,
      transitionPatchDigest: DIGEST,
      retiringProjection: { kind: "direct-transition" },
      authorization: "identity-renamed",
      result: { kind: "rename", targetSlug: "successor", artifactDigest: DIGEST },
    };
    receiptRelativePath = join(
      ".arc",
      "system",
      ".internal",
      "retirement-receipts",
      `${receiptId.replace(":", "-")}.json`,
    );
    receiptPath = join(repo, receiptRelativePath);
    receiptContent = canonicalize(receipt);
    await writeFile(receiptPath, receiptContent, "utf8");
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

  it("attaches the entering session only when the post-entry flag is explicit", async () => {
    const lociRoot = join(repo, ".arc", "user", "test-user", ".internal", "loci");
    const passive = await runArc(["wu", "reconcile", "dependent", "--json"], repo);

    expect(passive.exitCode).toBe(0);
    expect(JSON.parse(passive.stdout)).toMatchObject({ status: "pending", slug: "dependent" });
    await expect(readdir(lociRoot)).rejects.toMatchObject({ code: "ENOENT" });

    const result = await runArcAnchored(
      ["wu", "reconcile", "dependent", "--attach-session", "--json"],
      repo,
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "pending", slug: "dependent" });
    const records = (await readdir(lociRoot)).filter((name) => /^locus-[0-9a-f]{64}\.json$/u.test(name));
    expect(records).toHaveLength(1);
    const record = JSON.parse(await readFile(join(lociRoot, records[0] as string), "utf8"));
    expect(record).toMatchObject({
      checkoutPath: repo,
      role: { kind: "work-unit", subject: { kind: "work-unit", key: "dependent", claimId: null } },
      lease: { sessionHomePath: repo, anchor: { kind: "process" } },
    });
  });

  it("returns one JSON conflict and does not reconcile when identity resolution fails", async () => {
    await git(repo, ["config", "--unset", "arc.identity"]);
    await git(repo, ["config", "--unset", "user.name"]);
    const metaPath = join(repo, ".arc", "active", "meta-dependent.md");
    const before = await readFile(metaPath, "utf8");

    const result = await runArc(
      ["wu", "reconcile", "dependent", "--apply", "--attach-session", "--json"],
      repo,
      {
        env: {
          GIT_CONFIG_GLOBAL: join(repo, "missing-global-gitconfig"),
          GIT_CONFIG_NOSYSTEM: "1",
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "conflict",
      slug: "dependent",
      reason: expect.stringMatching(/identity resolution failed/iu),
    });
    expect(await readFile(metaPath, "utf8")).toBe(before);
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("returns one JSON conflict and does not reconcile when locus attachment is refused", async () => {
    const lociRoot = join(repo, ".arc", "user", "test-user", ".internal", "loci");
    const attached = await runArcAnchored(
      ["wu", "reconcile", "dependent", "--attach-session", "--json"],
      repo,
    );
    expect(attached.exitCode).toBe(0);
    const [recordName] = (await readdir(lociRoot)).filter((name) => /^locus-[0-9a-f]{64}\.json$/u.test(name));
    if (recordName === undefined) throw new Error("fixture locus record missing");
    const recordPath = join(lociRoot, recordName);
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.role.subject.key = "another-work-unit";
    await writeFile(recordPath, `${JSON.stringify(record)}\n`, "utf8");
    const metaPath = join(repo, ".arc", "active", "meta-dependent.md");
    const before = await readFile(metaPath, "utf8");

    const result = await runArcAnchored(
      ["wu", "reconcile", "dependent", "--apply", "--attach-session", "--json"],
      repo,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "conflict",
      slug: "dependent",
      reason: expect.stringMatching(/incompatible role generation/iu),
    });
    expect(await readFile(metaPath, "utf8")).toBe(before);
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe("");
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

  it("rechecks receipt evidence that appears after the dependent entered integration", async () => {
    const metaPath = join(repo, ".arc", "active", "meta-dependent.md");
    await writeFile(
      metaPath,
      meta("dependent", "main", "`origin`").replace("- **State:** Active", "- **State:** Integrating"),
      "utf8",
    );
    await git(repo, ["rm", receiptRelativePath]);
    await git(repo, ["add", ".arc/active/meta-dependent.md"]);
    await git(repo, ["commit", "-m", "enter integration before receipt"]);

    const blocked = await runArc(["status", "--session-init", "--json"], repo);
    expect(blocked.exitCode).toBe(0);
    expect(JSON.parse(blocked.stdout)).toMatchObject({
      currentWuReconcile: {
        ok: true,
        value: { status: "conflict", reason: "missing-evidence" },
      },
    });

    await mkdir(join(repo, ".arc", "system", ".internal", "retirement-receipts"), { recursive: true });
    await writeFile(receiptPath, receiptContent, "utf8");
    await git(repo, ["add", receiptRelativePath]);
    await git(repo, ["commit", "-m", "merge retirement evidence"]);
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

  it("keeps an owned clean reconcile invisible", async () => {
    const metaPath = join(repo, ".arc", "active", "meta-dependent.md");
    await writeFile(metaPath, meta("dependent", "main", "[none]"), "utf8");
    await git(repo, ["add", "--all"]);
    await git(repo, ["commit", "-m", "clear dependency"]);
    const before = await readFile(metaPath, "utf8");
    const beforeHead = await git(repo, ["rev-parse", "HEAD"]);

    const result = await runArc(["wu", "reconcile", "dependent", "--apply", "--json"], repo);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "clean",
      stagedPaths: [],
    });
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
      meta("dependent", "[none]", "`origin`").replace("- **State:** Active", "- **State:** Shipped"),
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
