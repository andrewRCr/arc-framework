/**
 * Smoke tests for commit-msg footer-convention validation.
 *
 * Locks regex-vs-method drift between the commit-footer method and the
 * commit-msg hook. Each case writes a commit message to a temp file and
 * invokes the hook, asserting exit code matches the expected pass/fail.
 *
 * The hook reads `arc-config.yml` via `arc-lib.sh`, so the test invokes
 * the hook with cwd set to the repo root.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const HOOK_PATH = resolve(REPO_ROOT, ".arc/system/.internal/githooks/commit-msg");

function buildMessage(subject: string, footer: string): string {
  return `${subject}\n\n${footer}\n`;
}

function runHook(messagePath: string): { status: number; stdout: string; stderr: string } {
  // Invoked via bash (matches husky's invocation shape — the hook isn't tracked
  // as executable in git, so direct invocation fails with permission denied).
  const result = spawnSync("bash", [HOOK_PATH, messagePath], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

const SUBJECT = "feat(scope): test commit message";

interface FooterCase {
  name: string;
  footer: string;
}

const positiveCases: FooterCase[] = [
  // tasks-* matrix
  { name: "tasks-* (Task X.Y)", footer: "Context: tasks-foo.md (Task 1.2)" },
  { name: "tasks-* (Task X.Y.a)", footer: "Context: tasks-foo.md (Task 1.2.a)" },
  { name: "tasks-* (Tasks range)", footer: "Context: tasks-foo.md (Tasks 1.2-1.4)" },
  { name: "tasks-* (Tasks non-contiguous)", footer: "Context: tasks-foo.md (Tasks 1.2, 3.4)" },
  { name: "tasks-* (Task X.Y; planning)", footer: "Context: tasks-foo.md (Task 1.2; planning)" },
  { name: "tasks-* (incidental during X) — tightened phrasing", footer: "Context: tasks-foo.md (incidental during Task 1.2)" },
  { name: "tasks-* (incidental during code review)", footer: "Context: tasks-foo.md (incidental during code review)" },
  { name: "tasks-* (planning)", footer: "Context: tasks-foo.md (planning)" },
  { name: "tasks-* (maintenance)", footer: "Context: tasks-foo.md (maintenance)" },
  { name: "tasks-* (code review)", footer: "Context: tasks-foo.md (code review)" },

  // plan-* / prd-*
  { name: "plan-* (planning)", footer: "Context: plan-foo.md (planning)" },
  { name: "plan-* (code review)", footer: "Context: plan-foo.md (code review)" },
  { name: "prd-* (planning)", footer: "Context: prd-foo.md (planning)" },
  { name: "prd-* (code review)", footer: "Context: prd-foo.md (code review)" },

  // meta-*
  { name: "meta-* (handoff)", footer: "Context: meta-foo.md (handoff)" },
  { name: "meta-* (activation)", footer: "Context: meta-foo.md (activation)" },
  { name: "meta-* (integration)", footer: "Context: meta-foo.md (integration)" },
  { name: "meta-* (archival)", footer: "Context: meta-foo.md (archival)" },
  { name: "meta-* (deactivation)", footer: "Context: meta-foo.md (deactivation)" },
  { name: "meta-* (maintenance)", footer: "Context: meta-foo.md (maintenance)" },
  { name: "meta-* (incidental during X)", footer: "Context: meta-foo.md (incidental during code review)" },

  // standalone — new anchor
  { name: "standalone (maintenance)", footer: "Context: standalone (maintenance)" },
  { name: "standalone (planning)", footer: "Context: standalone (planning)" },
  { name: "standalone (documentation)", footer: "Context: standalone (documentation)" },
  { name: "standalone (refactor)", footer: "Context: standalone (refactor)" },

  // atomic-*
  { name: "atomic-*", footer: "Context: atomic-foo.md" },

  // contribution
  { name: "contribution (freeform)", footer: "Context: contribution (fix typo in README)" },
];

const negativeCases: FooterCase[] = [
  // Retired (content) parenthetical
  { name: "tasks-* (content) — retired", footer: "Context: tasks-foo.md (content)" },

  // Retired phrasing `(incidental - discovered during X)`
  { name: "tasks-* (incidental - discovered during X) — retired phrasing", footer: "Context: tasks-foo.md (incidental - discovered during Task 1.2)" },

  // (maintenance) is for tasks-* / meta-* / standalone — not plan-* / prd-*
  { name: "plan-* (maintenance) — invalid", footer: "Context: plan-foo.md (maintenance)" },

  // (planning) is not in the meta-* parenthetical set
  { name: "meta-* (planning) — invalid", footer: "Context: meta-foo.md (planning)" },

  // Retired off-WU patterns (replaced by `standalone (...)`)
  { name: "off-WU (no associated task list) — retired", footer: "Context: planning (no associated task list)" },
  { name: "off-WU (atomic / no associated task list) — retired", footer: "Context: maintenance (atomic / no associated task list)" },

  // `content` dropped from off-WU vocabulary in standalone
  { name: "standalone (content) — content dropped", footer: "Context: standalone (content)" },
];

describe("commit-msg footer-convention smoke tests", () => {
  let tempDir: string;
  let messageFile: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "arc-commit-msg-test-"));
    messageFile = join(tempDir, "COMMIT_EDITMSG");
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("positive cases (must pass — exit 0)", () => {
    positiveCases.forEach((c) => {
      it(`accepts: ${c.name}`, () => {
        writeFileSync(messageFile, buildMessage(SUBJECT, c.footer));
        const result = runHook(messageFile);
        expect(result.status, `Hook rejected valid pattern.\nFooter: ${c.footer}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`).toBe(0);
      });
    });
  });

  describe("negative cases (must fail — exit non-0)", () => {
    negativeCases.forEach((c) => {
      it(`rejects: ${c.name}`, () => {
        writeFileSync(messageFile, buildMessage(SUBJECT, c.footer));
        const result = runHook(messageFile);
        expect(result.status, `Hook accepted invalid pattern.\nFooter: ${c.footer}\nStdout: ${result.stdout}`).not.toBe(0);
      });
    });
  });
});
