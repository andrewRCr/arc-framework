/** One selected Store supplies personal inbox content throughout a status invocation. */
import { expect, it } from "vitest";
import { createSessionStatusContext, readWorkingMemoryFromStore } from "../../../../src/handlers/status/session-context.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import type { RawGitExec } from "../../../../src/lib/git/exec.js";

it("reads the selected inbox without depending on a projected workspace file", async () => {
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  const content = "## Errand\n\n### **Stored capture**\n- _Id:_ `abcdef12`\n- _Created:_ `2026-10-16`\n\nStored body.\n";
  await h.seed(recordReferences["personal/inbox"](OwnerIdentitySchema.parse({ type: "person", name: "alice" })), content);
  const { exec } = scriptGitExec([
    { match: ["config", "--null", "--get", "arc.identity"], responses: [{ stdout: "alice\0" }] },
    { match: ["config", "--get", "arc.role"], responses: [{ stdout: "maintainer" }] },
  ]);
  const raw: RawGitExec = async () => ({ stdout: new Uint8Array() });
  const context = await createSessionStatusContext("/unprojected", exec, raw, raw, undefined, { store: h.store });
  expect(await context.readUserInbox("alice")).toBe(content);
  expect(context.identity).toBe("alice");
});

it("reads working memory from the selected personal record and treats authoritative absence as empty", async () => {
  const h = createLifecycleHarness();
  expect(await readWorkingMemoryFromStore(h.store, "alice")).toBe("");
  const reference = recordReferences["personal/working-memory"](OwnerIdentitySchema.parse({ type: "person", name: "alice" }));
  const content = "## Memories\n\n**Stored reminder:**\n_Remove when: complete._\n- _Id:_ `abcdef12`\n\nRemember the stored value.\n";
  await h.seed(reference, content);
  expect(await readWorkingMemoryFromStore(h.store, "alice")).toBe(content);
});
