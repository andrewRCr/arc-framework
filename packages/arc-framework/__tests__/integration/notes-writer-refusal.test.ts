/** Retired notes writers point to their store replacements, including before the first store pull. */
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { runUserCompact } from "../../src/commands/user/compact.js";
import { runUserFetch, runUserPull, runUserPush } from "../../src/commands/user/push-fetch.js";
import { runUserLoad, runUserRenameWorkspace, runUserSave } from "../../src/commands/user/save-load.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { storeImported } from "../../src/lib/store/store-imported.js";
import type { UserSaveOptions } from "../../src/commands/user/types.js";
import { git } from "../e2e/helpers.js";
import { addBareRemote, cleanupTempDir, commitAll, createTempRepo, makeCommit, makeUserIO } from "../helpers/integration.js";
import { writeProjectedIgnores } from "../helpers/projected-ignores.js";
import { runCli } from "../helpers/run-cli.js";
import { fixtureStore, personalRecords, stored } from "../helpers/store-session-personal-fixture.js";
import { readStoreRecord, seedProjectIdentity, seedStore } from "../helpers/store/seed-store.js";
import { makeTempRoot } from "../helpers/temp-repo.js";

const identity = SlugSchema.parse("test-user");
const condition = "Git notes are retired. Personal state lives in the store.";
const sync = "Run `arc sync` to pull store state. It also publishes store state to the configured push remote "
  + "and can push local code commits when the branch push policy allows it.";
const projectedFiles = "The projection keeps these files. No replacement step is needed.";
const writers: [string, (options: UserSaveOptions) => Promise<unknown>, string][] = [
  ["save", runUserSave, "Run `arc save` to save personal state."],
  ["load", runUserLoad, projectedFiles],
  ["workspace rename", (options) => runUserRenameWorkspace({ ...options, oldWuName: "alpha", newWuName: "beta" }),
    projectedFiles],
  ["push", runUserPush, sync],
  ["push without a checkout path", ({ io }) => runUserPush({ io, identity }), sync],
  ["fetch", runUserFetch, sync],
  ["pull", runUserPull, sync],
  ["compact", runUserCompact, "No notes history remains to compact."],
];

it.each(writers)("reports the notes refusal for %s on the default store", async (_name, write, guidance) => {
  const cwd = await createTempRepo();
  onTestFinished(() => cleanupTempDir(cwd));
  await makeCommit(cwd, "Initial code commit");
  await seedProjectIdentity(cwd, identity);

  await expect(write({ cwd, io: makeUserIO(cwd), identity })).rejects.toMatchObject({
    message: `${condition} ${guidance}`,
  });
});

it("refuses user save without creating a notes ref in a fresh clone before its first store pull", async () => {
  const source = await createTempRepo();
  onTestFinished(() => cleanupTempDir(source));
  await writeProjectedIgnores(source, identity);
  await commitAll(source, "Initial code commit");
  const origin = await addBareRemote(source);
  await git(source, ["config", "remote.origin.arc-state", "push"]);
  await seedProjectIdentity(source, identity);
  const { memory } = personalRecords(identity);
  await seedStore(source, identity, [{ reference: memory, content: "# Working Memory\n\n## Memories\n" }]);
  expect(await storeImported(source)).toBe(true);
  expect(stored(await fixtureStore(source).push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));

  const cwd = await makeTempRoot("arc-notes-clone-");
  onTestFinished(() => cleanupTempDir(cwd));
  await git(source, ["clone", "-c", "user.name=Test User", "-c", "user.email=test@example.com",
    "-c", `arc.identity=${identity}`, "-c", "remote.origin.arc-state=push", origin, cwd]);
  expect(await storeImported(cwd)).toBe(false);
  const listNotes = () => git(cwd, ["for-each-ref", "--format=%(refname)", "refs/notes/"]);
  expect(await listNotes()).toBe("");
  const personal = join(cwd, ".arc", "user", identity);
  await mkdir(personal, { recursive: true });
  const file = join(personal, "WORKING-MEMORY.md");
  const edit = "### **Remember this after the pull**\n\n- _Remove when:_ Done.\n";
  await writeFile(file, edit);

  const { exitCode, stderr, stdout } = await runCli(["user", "save"], { cwd });
  expect({ exitCode, output: stdout + stderr, notes: await listNotes() }).toEqual({
    exitCode: 1,
    output: expect.stringContaining(`${condition} Run \`arc save\` to save personal state.`),
    notes: "",
  });

  await rm(file);
  await writeProjectedIgnores(cwd, identity);
  await git(cwd, ["restore", "--", ".gitignore"]);
  const pull = await runCli(["sync", "--json"], { cwd });
  expect(pull.exitCode, pull.stdout + pull.stderr).toBe(0);
  expect(await storeImported(cwd)).toBe(true);
  await appendFile(file, `\n${edit}`);
  const save = await runCli(["save", "--json"], { cwd });
  expect(save.exitCode, save.stdout + save.stderr).toBe(0);
  expect((await readStoreRecord(cwd, identity, memory)).content).toContain(edit);
  expect(await listNotes()).toBe("");
});
