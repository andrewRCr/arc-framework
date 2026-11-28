/** An explicitly selected identity owns personal reads independently of Git configuration. */
import { expect, it, onTestFinished } from "vitest";
import { createStore } from "../../src/lib/store/create.js";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";
import { personalReference } from "../helpers/store/personal-fixture.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { seedStore } from "../helpers/store/seed-store.js";

it("reads the selected person's records while another identity is configured or the key is absent", async () => {
  const root = await createTempRepo("arc-store-default-identity-");
  onTestFinished(async () => cleanupTempDir(root));
  const exec = makeGitExec(root);
  await exec("git", ["config", "arc.identity", "andrew"]);
  await exec("git", ["commit", "--allow-empty", "-m", "Initialize personal fixture"]);
  const alice = SlugSchema.parse("alice");
  const reference = personalReference("personal/inbox", undefined, "alice");
  await seedStore(root, alice, [{ reference, content: "# USER-INBOX\n\nSelected Alice\n" }]);
  await seedStore(root, SlugSchema.parse("andrew"), [{
    reference: personalReference("personal/inbox"), content: "# USER-INBOX\n\nConfigured Andrew\n",
  }]);
  const selected = createStore(createDefaultStorePorts({ checkoutRoot: root, exec, identity: alice }));
  expect(selected.capabilities.stateOffBranch).toBe(true);
  expect(lifecycleSuccess(await selected.read({ reference })).content).toContain("Selected Alice");
  await exec("git", ["config", "--unset", "arc.identity"]);
  expect(lifecycleSuccess(await selected.read({ reference })).content).toContain("Selected Alice");
  expect((await exec("git", ["config", "--get", "user.name"])).stdout.trim()).not.toBe("alice");
});
