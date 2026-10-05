/** Store notes publication excludes only the resolved identity-root status view. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncFixture, syncNotesRef } from "../helpers/store/sync-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe("Store derived status publication", () => {
  it("saves a nested status document while excluding the exact derived root view", async () => {
    const h = await syncFixture();
    await mkdir(join(h.a.root, ".arc/active"), { recursive: true });
    await writeFile(join(h.a.root, ".arc/active/meta-example.md"), makeMetaFixture("example", { branch: "main" }));
    await h.a.exec("git", ["add", ".arc/active"]);
    await h.a.exec("git", ["commit", "-m", "current work unit"]);
    await h.a.exec("git", ["push", "origin", "main"]);
    await h.a.file("STATUS.USER.md", "derived bytes\n");
    await h.a.file("example/STATUS.USER.md", "ordinary document\n");
    const read = h.a.ports.fs.readFile;
    h.a.ports.fs.readFile = async (path) => {
      if (path === join(h.a.root, ".arc/user/andrew/STATUS.USER.md")) throw Object.assign(new Error("Derived body must not be opened"), { code: "EACCES" });
      return read(path);
    };
    success(await h.a.store.sync());
    const head = (await h.a.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
    const saved = JSON.parse((await h.remote("git", ["notes", `--ref=${syncNotesRef}`, "show", head])).stdout) as { files: Record<string, string> };
    expect(saved.files).not.toHaveProperty("STATUS.USER.md");
    expect(saved.files["example/STATUS.USER.md"]).toBe("ordinary document\n");
  });
});
