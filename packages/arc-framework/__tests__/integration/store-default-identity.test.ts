/** An explicitly selected identity owns personal reads independently of Git configuration. */
import { expect, it } from "vitest";
import { createStore } from "../../src/lib/store/create.js";
import { personalFixture, personalReference } from "../helpers/store/personal-fixture.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { seedStore } from "../helpers/store/seed-store.js";

it("reads the selected person's records while another identity is configured or the key is absent", async () => {
  const h = await personalFixture();
  const alice = SlugSchema.parse("alice");
  const reference = personalReference("personal/inbox", undefined, "alice");
  await seedStore(h.root, alice, [{ reference, content: "# USER-INBOX\n\nSelected Alice\n" }]);
  await seedStore(h.root, SlugSchema.parse("andrew"), [{
    reference: personalReference("personal/inbox"), content: "# USER-INBOX\n\nConfigured Andrew\n",
  }]);
  const selected = createStore(createDefaultStorePorts({ checkoutRoot: h.root, exec: h.exec, identity: alice }));
  expect(selected.capabilities.stateOffBranch).toBe(true);
  expect(lifecycleSuccess(await selected.read({ reference })).content).toContain("Selected Alice");
  await h.exec("git", ["config", "--unset", "arc.identity"]);
  expect(lifecycleSuccess(await selected.read({ reference })).content).toContain("Selected Alice");
  expect((await h.exec("git", ["config", "--get", "user.name"])).stdout.trim()).not.toBe("alice");
});
