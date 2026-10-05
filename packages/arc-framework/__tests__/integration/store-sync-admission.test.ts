/** Notes save filters metadata before bodies and preserves publication and repaired continuation. */
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { syncFixture, syncPut, syncNotesRef } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { MAX_FILE_SIZE } from "../../src/lib/git/user-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { mkdir, writeFile } from "node:fs/promises";

async function fixture() {
  const h = await syncFixture();
  await mkdir(join(h.a.root, ".arc/active"), { recursive: true });
  await writeFile(join(h.a.root, ".arc/active/meta-example.md"), makeMetaFixture("example", { branch: "main" }));
  await h.a.exec("git", ["add", ".arc/active"]);
  await h.a.exec("git", ["commit", "-m", "current work unit"]);
  await h.a.exec("git", ["push", "origin", "main"]);
  await h.a.file("notes.md", "identity notes\n");
  await h.a.file("example/SESSION-NOTES.md", "selected session\n");
  success(await h.a.store.write(syncPut()));
  return h;
}
async function manifest(h: Awaited<ReturnType<typeof fixture>>) {
  const head = (await h.a.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  return JSON.parse((await h.remote("git", ["notes", `--ref=${syncNotesRef}`, "show", head])).stdout) as { files: Record<string, string> };
}
describe("notes metadata admission", () => {
  it("never opens excluded, oversized, foreign-workspace bodies and completes both publishes", async () => {
    const h = await fixture();
    const ignored = ["README.md", "secret.pem", "ignored.bin", "large.md", "other/SESSION-NOTES.md"];
    for (const key of ignored) await h.a.file(key, key === "large.md" ? "x".repeat(MAX_FILE_SIZE + 1) : "unreadable\n");
    const read = h.a.ports.fs.readFile;
    const opened: string[] = [];
    h.a.ports.fs.readFile = async (path) => {
      const key = relative(join(h.a.root, ".arc/user/andrew"), path).split("\\").join("/");
      opened.push(key);
      if (ignored.includes(key)) throw Object.assign(new Error("Excluded body must not be opened"), { code: "EACCES" });
      return read(path);
    };
    expect(success(await h.a.store.sync()).publishes).toEqual([
      { status: "pushed", families: ["personal"] }, { status: "pushed", families: ["work-item", "claims"] },
    ]);
    expect(opened).toEqual(expect.arrayContaining(["notes.md", "example/SESSION-NOTES.md"]));
    for (const key of ignored) expect(opened).not.toContain(key);
    expect((await manifest(h)).files).toMatchObject({ "notes.md": "identity notes\n", "example/SESSION-NOTES.md": "selected session\n" });
    for (const key of ignored) expect((await manifest(h)).files).not.toHaveProperty(key);
  });
  it("preserves an admitted read failure and succeeds after restoring read access", async () => {
    const h = await fixture();
    const read = h.a.ports.fs.readFile;
    const original = Object.assign(new Error("Eligible body unreadable"), { code: "EACCES" });
    h.a.ports.fs.readFile = async (path) => { if (path.endsWith("/notes.md")) throw original; return read(path); };
    await expect(h.a.store.sync()).rejects.toMatchObject({ code: "store.sync-failed", cause: original });
    h.a.ports.fs.readFile = read;
    expect(success(await h.a.store.sync()).publishes.map((publish) => publish.status)).toEqual(["pushed", "pushed"]);
    expect((await manifest(h)).files["notes.md"]).toBe("identity notes\n");
  });
});
