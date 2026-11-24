/** Notes writers point to their store replacements once a repository has imported its state. */
import { expect, it, onTestFinished } from "vitest";
import { runUserCompact } from "../../src/commands/user/compact.js";
import { runUserFetch, runUserPull, runUserPush } from "../../src/commands/user/push-fetch.js";
import { runUserLoad, runUserRenameWorkspace, runUserSave } from "../../src/commands/user/save-load.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import type { UserSaveOptions } from "../../src/commands/user/types.js";
import { cleanupTempDir, createTempRepo, makeCommit, makeUserIO } from "../helpers/integration.js";
import { seedProjectIdentity } from "../helpers/store/seed-store.js";

const identity = SlugSchema.parse("test-user");
const condition = "Git notes are retired. Personal state lives in the store.";
const sync = "Run `arc sync` to synchronize personal state.";
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
