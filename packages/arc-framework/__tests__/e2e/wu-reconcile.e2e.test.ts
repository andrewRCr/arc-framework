import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";

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

  beforeEach(async () => {
    repo = await createTempRepo("arc-wu-reconcile-");
    const active = join(repo, ".arc", "active");
    const records = join(repo, ".arc", "system", ".internal", "retirement-receipts");
    await mkdir(active, { recursive: true });
    await mkdir(records, { recursive: true });
    await writeFile(
      join(active, "meta-dependent.md"),
      meta("dependent", "main", "`origin`"),
      "utf8",
    );
    await writeFile(
      join(active, "meta-successor.md"),
      meta("successor", "feat/successor", "[none]"),
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
    await writeFile(
      join(records, `${receiptId.replace(":", "-")}.json`),
      canonicalize(receipt),
      "utf8",
    );
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

  it("refuses to write a work unit owned by another branch", async () => {
    const dependentPath = join(repo, ".arc", "active", "meta-dependent.md");
    const successorPath = join(repo, ".arc", "active", "meta-successor.md");
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
});
