/** The notes fetch and pull commands refuse and exit on a repository whose state lives in the store. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, it, onTestFinished } from "vitest";

import { SlugSchema } from "../../src/lib/kernel/index.js";
import { addBareRemote, cleanupTempDir, commitAll, createTempRepo } from "../helpers/integration.js";
import { writeProjectedIgnores } from "../helpers/projected-ignores.js";
import { seedProjectIdentity } from "../helpers/store/seed-store.js";
import { git, runArc } from "./helpers.js";

const execFileAsync = promisify(execFile);
const identity = SlugSchema.parse("test-user");
const refusal = "Git notes are retired. Personal state lives in the store.";

/** An ARC project holding an imported store, and a local notes ref from before its import. */
async function importedRepositoryWithLocalNotes(): Promise<{ cwd: string; origin: string }> {
  const cwd = await createTempRepo();
  onTestFinished(() => cleanupTempDir(cwd));
  await writeProjectedIgnores(cwd, identity);
  await commitAll(cwd, "Initial code commit");
  const origin = await addBareRemote(cwd);
  await git(cwd, ["config", "remote.origin.arc-state", "push"]);
  await seedProjectIdentity(cwd, identity);
  await execFileAsync("git", ["notes", "--ref", `arc/user/${identity}`, "add", "-m", "{}", "HEAD"], { cwd });
  return { cwd, origin };
}

it.each(["fetch", "pull"])("user %s reports the notes refusal and exits without asking a question", async (command) => {
  const { cwd, origin } = await importedRepositoryWithLocalNotes();

  const result = await runArc(["--no-input", "user", command, "--identity", identity], cwd, { timeout: 30_000 });

  expect(result.timedOut).toBeUndefined();
  expect(result.exitCode).toBe(1);
  const output = `${result.stdout}${result.stderr}`.replace(/\s+/gu, " ");
  expect(output).toContain(refusal);
  expect(output).not.toContain("--yes");
  const advice = output.slice(output.indexOf(refusal) + refusal.length).trim();
  expect(advice).toContain("`arc sync`");
  expect(advice).toMatch(/\b(?:push|publish)(?:es)?\b[^.]*\b(?:state|refs)\b/iu);
  expect(advice).toMatch(/\bpulls?\b/iu);
  expect(advice).toMatch(/\bpush(?:es)?\b[^.]*\bcommits?\b[^.]*\b(?:policy|interlock)\b/iu);

  expect(await git(origin, ["for-each-ref", "--format=%(refname)", "refs/arc/project/registry"])).toBe("");
  const sync = await runArc(["--no-input", "sync", "--json"], cwd, { timeout: 30_000 });
  expect(sync.exitCode, sync.stdout + sync.stderr).toBe(0);
  expect(JSON.parse(sync.stdout)).toMatchObject({ state: { pull: { action: "pull" }, push: { result: "success" } } });
  expect(await git(origin, ["for-each-ref", "--format=%(refname)", "refs/arc/project/registry"]))
    .toBe("refs/arc/project/registry");
});
