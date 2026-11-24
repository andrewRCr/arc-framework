/** The notes fetch and pull commands refuse and exit on a repository whose state lives in the store. */
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { expect, it, onTestFinished } from "vitest";

import { SlugSchema } from "../../src/lib/kernel/index.js";
import { cleanupTempDir, createTempRepo, makeCommit } from "../helpers/integration.js";
import { seedProjectIdentity } from "../helpers/store/seed-store.js";
import { runArc } from "./helpers.js";

const execFileAsync = promisify(execFile);
const identity = SlugSchema.parse("test-user");
const refusal = "Git notes are retired. Personal state lives in the store. Run `arc sync` to synchronize personal state.";

/** An ARC project holding an imported store, and a local notes ref from before its import. */
async function importedRepositoryWithLocalNotes(): Promise<string> {
  const cwd = await createTempRepo();
  onTestFinished(() => cleanupTempDir(cwd));
  await mkdir(join(cwd, ".arc"));
  await makeCommit(cwd, "Initial code commit");
  await seedProjectIdentity(cwd, identity);
  await execFileAsync("git", ["notes", "--ref", `arc/user/${identity}`, "add", "-m", "{}", "HEAD"], { cwd });
  return cwd;
}

it.each(["fetch", "pull"])("user %s reports the notes refusal and exits without asking a question", async (command) => {
  const cwd = await importedRepositoryWithLocalNotes();

  const result = await runArc(["--no-input", "user", command, "--identity", identity], cwd, { timeout: 30_000 });

  expect(result.timedOut).toBeUndefined();
  expect(result.exitCode).toBe(1);
  expect(`${result.stdout}${result.stderr}`.replace(/\s+/gu, " ")).toContain(refusal);
  expect(`${result.stdout}${result.stderr}`).not.toContain("--yes");
});
