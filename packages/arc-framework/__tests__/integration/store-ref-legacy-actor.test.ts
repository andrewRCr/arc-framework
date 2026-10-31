/** Native ref writes retain the clone identity that predates common-directory machine IDs. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultRefStorePorts, createRefStore } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("native actor adoption in %s", layout => {
  it.each(["machine-id", "sync-state"] as const)("adopts an ID held only in the legacy %s file", async legacy => {
    const f = await createRefFixture({}, layout);
    const identity = "test-user", id = "12345678-1234-4234-8234-123456789abc";
    await f.ports.exec("git", ["config", "arc.identity", identity]);
    const directory = join(f.root, ".arc", "user", identity, ".internal");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, legacy === "machine-id" ? ".machine-id" : ".sync-state.json"),
      legacy === "machine-id" ? `${id}\n` : JSON.stringify({ machineId: id }));
    const store = createRefStore(createDefaultRefStorePorts({ checkoutRoot: f.root, backingRepository: async () => null }));
    const reference = f.reference("personal/document");
    success(await store.write({ action: "put", reference, expected: null, content: "# Personal note\n", provenance: testProvenance }));
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const message = (await f.ports.exec("git", [...args, "log", "-1", "--format=%B", `refs/arc/user/${identity}/personal`])).stdout;
    expect(message).toContain(`Arc-Actor: ${identity}@${id}`);
    expect((await readFile(join(f.root, ".git", "arc", "user", identity, ".internal", ".machine-id"), "utf8")).trim()).toBe(id);
  });
});
