/** Native ref-store port binding through the public store boundary. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createDefaultRefStorePorts, createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

it("mints the shared machine actor only on a write and reuses it after reopening", async () => {
  const h = await refSyncFixture();
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "native.md", owner: { type: "person", name: "andrew" } });
  const input = { checkoutRoot: h.a.root, backingRepository: async () => null };
  const first = createRefStore(createDefaultRefStorePorts(input));
  const file = join(h.a.root, ".git", "arc", "user", "andrew", ".internal", ".machine-id");
  success(await first.version());
  await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  const made = success(await first.write({ action: "put", reference, expected: null, content: "Native.\n",
    provenance: { verb: "edit", lifecycleAction: "save" } }));
  const machine = (await readFile(file, "utf8")).trim();
  expect(machine).toMatch(/^[0-9a-f-]{36}$/u);
  expect((await h.a.git(["log", "-1", "--format=%B", "refs/arc/user/andrew/personal"])).stdout).toContain(`Arc-Actor: andrew@${machine}`);
  const second = createRefStore(createDefaultRefStorePorts(input));
  success(await second.write({ action: "put", reference: made.reference, expected: success(await second.read({ reference: made.reference })).version, content: "Reopened.\n",
    provenance: { verb: "edit", lifecycleAction: "save" } }));
  expect((await readFile(file, "utf8")).trim()).toBe(machine);
  expect((await h.a.git(["log", "-1", "--format=%B", "refs/arc/user/andrew/personal"])).stdout).toContain(`Arc-Actor: andrew@${machine}`);
  expect(success(await second.read({ reference })).content).toBe("Reopened.\n");
});
