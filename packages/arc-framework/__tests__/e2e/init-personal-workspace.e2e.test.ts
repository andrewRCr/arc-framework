/** Follow the installed setup workflow to verify the seeded personal records. */
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

async function setupCheckout(command: "init" | "join", identity: string): Promise<string> {
  const root = await createTempRepo();
  onTestFinished(() => cleanupTempDir(root));
  const installer = command === "join" ? "project-owner" : identity;
  const init = await runArcNoTty(["--no-input", "init", "--name", "Example", "--identity", installer, "--tools", ""], root);
  expect(init.exitCode, init.stdout + init.stderr).toBe(0);
  if (command === "init") return root;

  await git(root, ["add", "-A"]);
  await git(root, ["commit", "--no-verify", "-m", "Install ARC"]);
  const checkout = join(root, "member-checkout");
  await git(root, ["clone", "--no-local", root, checkout]);
  await git(checkout, ["config", "user.name", "Test User"]);
  await git(checkout, ["config", "user.email", "test@example.com"]);
  await expect(access(join(checkout, ".arc/user", identity))).rejects.toMatchObject({ code: "ENOENT" });
  const joined = await runArcNoTty(["--no-input", "join", "--contributor", "--identity", identity, "--tools", ""], checkout);
  expect(joined.exitCode, joined.stdout + joined.stderr).toBe(0);
  expect(await git(checkout, ["config", "--local", "--get", "arc.identity"])).toBe(identity);
  return checkout;
}

it.each([
  { command: "init", identity: "installer", instructions: /### Verify Session State\r?\n([\s\S]*?)(?=\r?\n### )/u },
  { command: "join", identity: "new-member", instructions: /^- \*\*User workspace\*\*(.*(?:\r?\n {2}\S[^\r\n]*)*)/mu },
] as const)("projects the personal records before the $command workflow checks them", async ({ command, identity, instructions }) => {
  const root = await setupCheckout(command, identity);

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
