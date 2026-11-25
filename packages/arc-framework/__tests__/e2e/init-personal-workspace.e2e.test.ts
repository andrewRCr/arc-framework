/** Follow the installed setup workflow to verify the seeded personal records. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { cleanupTempDir, createTempRepo, runArcNoTty } from "./helpers.js";

it.each([
  { check: "fresh install", instructions: /### Verify Session State\r?\n([\s\S]*?)(?=\r?\n### )/u },
  { check: "join", instructions: /^- \*\*User workspace\*\*(.*(?:\r?\n {2}\S[^\r\n]*)*)/mu },
])("projects the personal records before the $check workflow checks them", async ({ instructions }) => {
  const root = await createTempRepo();
  onTestFinished(() => cleanupTempDir(root));
  const identity = "new-member";
  const init = await runArcNoTty(["--no-input", "init", "--name", "Example", "--identity", identity, "--tools", ""], root);
  expect(init.exitCode, init.stdout + init.stderr).toBe(0);

  const workflow = await readFile(join(root, ".arc/system/workflows/arc/initial-setup/01_verify-and-configure.md"), "utf8");
  const step = workflow.match(instructions)?.[1] ?? "";
  const projection = /`arc (status(?:\s+[^\s`]+)*)`/u.exec(step);
  const check = step.search(/\b(?:WORKING-MEMORY\.md|exists, seeded)\b/u);
  const workspace = join(root, ".arc/user", identity);
  expect(check, "The workflow should identify the working-memory file to verify").toBeGreaterThanOrEqual(0);
  if (projection?.[1] !== undefined && projection.index < check) {
    const status = await runArcNoTty(projection[1].split(/\s+/u), root);
    expect(status.exitCode, status.stdout + status.stderr).toBe(0);
  }
  expect(await readFile(join(workspace, "WORKING-MEMORY.md"), "utf8")).toContain("**Post-install setup:**");
  expect(await readFile(join(workspace, "USER-INBOX.md"), "utf8")).toContain("# User Inbox");
});
