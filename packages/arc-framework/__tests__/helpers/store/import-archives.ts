/** Archived source records with duplicate numbers and an intentional numbering gap. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { ArchiveQuarterSchema, ArchiveSequenceSchema, SlugSchema } from "../../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { seedImportCandidates } from "./import-candidates.js";

export const IMPORT_ARCHIVED_WORK = [
  { name: "archived", sequence: "53" },
  { name: "also-archived", sequence: "53" },
  { name: "last-archived", sequence: "55" },
] as const;
export const IMPORT_ARCHIVED_COHORTS = [
  { name: "closed-a", sequence: "53", closeout: "a" },
  { name: "closed-b", sequence: "55", closeout: "b" },
] as const;

/** Add completed source files without renumbering their legacy folders. */
export async function seedImportArchives(root: string, git: GitExec): Promise<void> {
  for (const { name, sequence } of IMPORT_ARCHIVED_WORK) {
    const placement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q3"), sequence: ArchiveSequenceSchema.parse(sequence) };
    for (const [artifact, content] of [
      ["meta", makeMetaFixture(name, { state: "Shipped", owner: "andrew", branch: null, completed: "2026-10-01", prUrl: "https://example.test/pull/1" })],
      ["spec", `# Spec: ${name}\n\n**Purpose:** Preserve the shipped source.\n`],
      ["notes", `# Notes: ${name}\n\nCompleted observations.\n`],
    ] as const) {
      const path = resolveArcPath({ kind: "work-unit-artifact", artifact, slug: SlugSchema.parse(name), placement });
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }
  }
  for (const { name, sequence, closeout } of IMPORT_ARCHIVED_COHORTS) {
    const path = resolveArcPath({ kind: "cohort-document", cohort: [SlugSchema.parse(name)], placement: {
      kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3"), sequence: ArchiveSequenceSchema.parse(sequence), closeout: closeout === "a" ? "leaf" : "parent",
    } });
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `# Cohort: \`${name}\`\n\n**Purpose:** Preserve the closed cohort.\n`);
  }
  await git("git", ["add", ".arc"]);
  await git("git", ["commit", "-m", "Seed completed tracked work"]);
  await seedImportCandidates(root, git);
}
