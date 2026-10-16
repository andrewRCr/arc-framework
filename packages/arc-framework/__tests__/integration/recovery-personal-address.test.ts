/** Recovery preserves personal addresses while records remain selected through Store. */
import { expect, it } from "vitest";
import { join } from "node:path";
import { personalFixture, personalReference } from "../helpers/store/personal-fixture.js";
import { makeGitExec } from "../helpers/integration.js";
import { ReferenceBackend } from "../helpers/store/reference-backend.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { resolveRecoveryWorkingMemoryPath } from "../../src/lib/recover/working-memory-path.js";

it.each([false, true])("preserves the primary memory address and selected Store content from a linked checkout (offBranch=%s)", async (offBranch) => {
  const h = await personalFixture();
  await h.plant("WORKING-MEMORY.md", "# WORKING-MEMORY\n\nPrimary memory.\n");
  const linked = join(h.root, "linked");
  await h.exec("git", ["worktree", "add", "-b", "linked", linked]);
  const identity = SlugSchema.parse("andrew"), exec = makeGitExec(linked);
  const reference = personalReference("personal/working-memory");
  const memory = new ReferenceBackend();
  memory.environment.identity = identity;
  lifecycleSuccess(await memory.write({ action: "put", reference, expected: null, content: "# WORKING-MEMORY\n\nStored memory.\n",
    provenance: { verb: "user", lifecycleAction: "create" } }));
  const store = offBranch ? memory : createStore(createDefaultStorePorts({ checkoutRoot: linked, exec, identity }));
  const address = await resolveRecoveryWorkingMemoryPath({ cwd: linked, identity, exec });
  expect(address).toBe(join(h.root, ".arc/user/andrew/WORKING-MEMORY.md"));
  expect(lifecycleSuccess(await store.read({ reference })).content).toContain(offBranch ? "Stored memory." : "Primary memory.");
});
it("preserves the current-checkout fallback when local worktree topology is unavailable", async () => {
  expect(await resolveRecoveryWorkingMemoryPath({ cwd: "/repository", identity: SlugSchema.parse("andrew"),
    exec: () => Promise.reject(new Error("worktree topology unavailable")) }))
    .toBe("/repository/.arc/user/andrew/WORKING-MEMORY.md");
});
