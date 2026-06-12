/**
 * Integration tests for validate-cohort-consistency.ts — pre-commit CHECK 18.
 *
 * Exercises the validator the way the hook invokes it: via `npx tsx` against
 * on-disk fixture metas and cohort docs under real `.arc/backlog/planned/`
 * paths in a temp directory. Covers a consistent cohort (pass) plus the three
 * failure modes — field↔dir drift, a missing cohort doc, and an orphan member
 * section — and the lifecycle-complete live scan (a graduated member and an
 * unstaged ancestor doc, both resolved from the on-disk tree). Absolute fixture
 * paths are passed; the validator anchors on the `.arc/backlog/planned/` segment
 * wherever it appears, and roots its live-tree walk at each fixture's own `.arc/`
 * tree (derived from the absolute path), so the cases stay isolated from the real
 * repo while the subprocess keeps `cwd` at the repo root.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const SCRIPT_PATH = resolve(
  REPO_ROOT,
  "packages/arc-framework/src/scripts/validate-cohort-consistency.ts",
);

/** `npx tsx` startup is the dominant cost; give each subprocess case headroom. */
const CASE_TIMEOUT_MS = 30_000;

async function runValidator(
  absPaths: string[],
): Promise<{ code: number; stderr: string; stdout: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "npx",
      ["tsx", SCRIPT_PATH, ...absPaths],
      { cwd: REPO_ROOT },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stderr?: string; stdout?: string };
    return { code: e.code ?? 1, stderr: e.stderr ?? "", stdout: e.stdout ?? "" };
  }
}

async function writeFixture(base: string, relPath: string, content: string): Promise<string> {
  const full = join(base, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
  return full;
}

function metaFixture(cohort: string): string {
  return [`# Metadata: widget`, "", `- **Cohort:** ${cohort}`, "", "---", ""].join("\n");
}

function cohortDocFixture(
  leaf: string,
  opts: { purpose?: string | null; members?: string[] } = {},
): string {
  const { purpose = "Why this grouping of work units exists.", members = [] } = opts;
  const lines = [`# Cohort: \`${leaf}\``, ""];
  if (purpose !== null) lines.push(`**Purpose:** ${purpose}`, "");
  if (members.length > 0) {
    lines.push("## Members", "");
    for (const member of members) lines.push(`### \`${member}\``, "", "_Exposes:_ a surface.", "");
  }
  lines.push("---", "");
  return lines.join("\n");
}

describe("validate-cohort-consistency.ts (pre-commit CHECK 18)", () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "arc-cohort-consistency-"));
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it(
    "passes a consistent cohort — field matches dir, doc present with Purpose",
    async () => {
      const dir = join(tmp, "case-pass");
      const meta = await writeFixture(
        dir,
        ".arc/backlog/planned/core/widget/meta-widget.md",
        metaFixture("`core`"),
      );
      const doc = await writeFixture(
        dir,
        ".arc/backlog/planned/core/cohort-core.md",
        cohortDocFixture("core", { members: ["widget"] }),
      );
      const result = await runValidator([meta, doc]);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "fails on field↔dir drift — diagnostic names the meta",
    async () => {
      const dir = join(tmp, "case-drift");
      const meta = await writeFixture(
        dir,
        ".arc/backlog/planned/core/widget/meta-widget.md",
        metaFixture("`other`"),
      );
      const doc = await writeFixture(
        dir,
        ".arc/backlog/planned/core/cohort-core.md",
        cohortDocFixture("core"),
      );
      const result = await runValidator([meta, doc]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("meta-widget.md");
      expect(result.stderr).toMatch(/does not match/i);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "fails when a grouping dir carries no cohort doc",
    async () => {
      const dir = join(tmp, "case-missing-doc");
      const meta = await writeFixture(
        dir,
        ".arc/backlog/planned/core/widget/meta-widget.md",
        metaFixture("`core`"),
      );
      const result = await runValidator([meta]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("cohort-core.md");
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "fails on an orphan member section",
    async () => {
      const dir = join(tmp, "case-orphan");
      const meta = await writeFixture(
        dir,
        ".arc/backlog/planned/core/widget/meta-widget.md",
        metaFixture("`core`"),
      );
      const doc = await writeFixture(
        dir,
        ".arc/backlog/planned/core/cohort-core.md",
        cohortDocFixture("core", { members: ["ghost"] }),
      );
      const result = await runValidator([meta, doc]);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/orphan.*ghost/i);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "does not flag a graduated member whose meta lives in active/",
    async () => {
      const dir = join(tmp, "case-graduated");
      const meta = await writeFixture(
        dir,
        ".arc/backlog/planned/core/widget/meta-widget.md",
        metaFixture("`core`"),
      );
      const doc = await writeFixture(
        dir,
        ".arc/backlog/planned/core/cohort-core.md",
        cohortDocFixture("core", { members: ["widget", "shipped"] }),
      );
      // `shipped` graduated to active/ — present on disk, absent from the staged set.
      await writeFixture(dir, ".arc/active/meta-shipped.md", metaFixture("`core`"));
      const result = await runValidator([meta, doc]);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "accepts an unstaged ancestor cohort doc present on disk",
    async () => {
      const dir = join(tmp, "case-ancestor-doc");
      const meta = await writeFixture(
        dir,
        ".arc/backlog/planned/core/sub/widget/meta-widget.md",
        metaFixture("`core/sub`"),
      );
      const subDoc = await writeFixture(
        dir,
        ".arc/backlog/planned/core/sub/cohort-sub.md",
        cohortDocFixture("sub", { members: ["widget"] }),
      );
      // The ancestor `core` doc lives on disk but is not staged.
      await writeFixture(
        dir,
        ".arc/backlog/planned/core/cohort-core.md",
        cohortDocFixture("core"),
      );
      const result = await runValidator([meta, subDoc]);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
    },
    CASE_TIMEOUT_MS,
  );
});
