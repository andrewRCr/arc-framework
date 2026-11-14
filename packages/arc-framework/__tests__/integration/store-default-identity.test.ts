/** An explicitly selected identity owns personal reads independently of Git configuration. */
import { expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { personalFixture, personalReference } from "../helpers/store/personal-fixture.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { inRepoStore } from "../helpers/store/in-repo-ports.js";

it("reads the selected person's records while another identity is configured or the key is absent", async () => {
  const h = await personalFixture();
  const root = join(h.root, ".arc/user/alice");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "USER-INBOX.md"), "# USER-INBOX\n\nSelected Alice\n");
  await h.plant("USER-INBOX.md", "# USER-INBOX\n\nConfigured Andrew\n");
  const selected = inRepoStore(createDefaultStorePorts({ checkoutRoot: h.root, exec: h.exec, identity: SlugSchema.parse("alice") }));
  const reference = personalReference("personal/inbox", undefined, "alice");
  expect(lifecycleSuccess(await selected.read({ reference })).content).toContain("Selected Alice");
  await h.exec("git", ["config", "--unset", "arc.identity"]);
  expect(lifecycleSuccess(await selected.read({ reference })).content).toContain("Selected Alice");
  expect((await h.exec("git", ["config", "--get", "user.name"])).stdout.trim()).not.toBe("alice");
});
