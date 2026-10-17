import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createRefLockFactory } from "../../src/lib/store/default-ports.js";
import { readGitDirectories } from "../../src/lib/git/directories.js";

const primary = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
const provenance = { verb: "test-write", lifecycleAction: "test" };

describe("commit serialization with layout moves", () => {
  it("retains the layout lock until asynchronous publication finishes", async () => {
    const f = await createRefReadFixture();
    const seeded = success(await f.store.write({ action: "put", reference: primary, expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
    const native = createRefLockFactory(f.ports);
    let observed: unknown;
    const store = createRefStore({ ...f.ports, lock: native, exec: async (...args) => {
      if (args[1][0] === "commit-tree") {
        try { const release = await native("layout", 20); await release(); observed = "unlocked"; }
        catch (error) { observed = error; }
      }
      return f.ports.exec(...args);
    } });
    const reference = RecordReferenceSchema.parse({ ...seeded.reference, kind: "work-item/companion", key: "extra" });
    success(await store.write({ action: "put", reference, expected: null, content: "serialized", provenance }));
    expect(observed).toMatchObject({ name: "AdvisoryLockTimeoutError", phase: "acquire" });
    expect(success(await store.read({ reference })).content).toBe("serialized");
    const release = await native("layout", 20);
    await release();
  });

  it.each(["into-directory", "out-of-directory", "directory-round-trip"] as const)("releases, resolves, and writes in the new layout: %s", async (direction) => {
    const f = await createRefReadFixture();
    if (direction !== "into-directory") await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    const seeded = success(await f.store.write({ action: "put", reference: primary, expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
    if (seeded.reference.owner.type !== "work-item") throw new Error("Expected work-item owner");
    const ref = `refs/arc/work/${seeded.reference.owner.uid}`;
    const { commonDir } = await readGitDirectories(f.root, f.ports.fs), directory = join(commonDir, "arc", "store");
    const native = createRefLockFactory(f.ports);
    let move = true;
    const store = createRefStore({ ...f.ports, lock: async (name, wait) => {
      if (name === "layout" && move) {
        move = false;
        const release = await native("layout", 200);
        try {
          if (direction === "into-directory") {
            const tip = (await f.exec("git", ["rev-parse", ref])).stdout;
            await f.exec("git", ["init", "--bare", "--ref-format=reftable", "--object-format=sha1", directory]);
            await f.exec("git", [`--git-dir=${directory}`, "fetch", "--no-tags", commonDir, `${ref}:${ref}`]);
            await f.exec("git", ["update-ref", "-d", ref, tip]);
          } else {
            await f.exec("git", ["fetch", "--no-tags", directory, `${ref}:${ref}`]);
            const aside = `${directory}-moved`;
            await f.ports.fs.rename(directory, aside);
            await f.ports.fs.removeDirectory(aside);
            if (direction === "directory-round-trip") {
              const tip = (await f.exec("git", ["rev-parse", ref])).stdout;
              await f.exec("git", ["init", "--bare", "--ref-format=reftable", "--object-format=sha1", directory]);
              await f.exec("git", [`--git-dir=${directory}`, "fetch", "--no-tags", commonDir, `${ref}:${ref}`]);
              await f.exec("git", ["update-ref", "-d", ref, tip]);
            }
          }
        } finally { await release(); }
      }
      return native(name, wait ?? 200);
    } });
    const reference = RecordReferenceSchema.parse({ ...seeded.reference, kind: "work-item/companion", key: "extra" });
    success(await store.write({ action: "put", reference, expected: null, content: "after move", provenance }));
    expect(success(await f.store.read({ reference })).content).toBe("after move");
    const args = direction !== "out-of-directory" ? [`--git-dir=${directory}`] : [];
    expect((await f.exec("git", [...args, "show", `${ref}:extra-alpha.md`])).stdout).toBe("after move");
    expect((await f.exec("git", [...args, "show", `${ref}:meta-alpha.md`])).stdout).toBe(makeMetaFixture("alpha").trimEnd());
    if (direction !== "out-of-directory") expect((await f.exec("git", ["for-each-ref", "--format=%(refname)", ref])).stdout).toBe("");
    else await expect(f.ports.fs.lstat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["files", "reftable"] as const)("refuses a held layout lock and succeeds after release (%s)", async (format) => {
    const f = await createRefReadFixture(format);
    const seeded = success(await f.store.write({ action: "put", reference: primary, expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
    if (seeded.reference.owner.type !== "work-item") throw new Error("Expected work-item owner");
    const ref = `refs/arc/work/${seeded.reference.owner.uid}`, before = (await f.exec("git", ["rev-parse", ref])).stdout;
    const native = createRefLockFactory(f.ports), release = await native("layout", 100);
    const { commonDir } = await readGitDirectories(f.root, f.ports.fs);
    const store = createRefStore({ ...f.ports, lock: (name) => native(name, 20) });
    const reference = RecordReferenceSchema.parse({ ...seeded.reference, kind: "work-item/companion", key: "extra" });
    const input = { action: "put" as const, reference, expected: null, content: "after lock", provenance };
    try {
      expect(await store.write(input)).toMatchObject({ status: "refused", refusal: { code: "lock-held", lock: join(commonDir, "arc", "locks", "layout.lock") } });
      expect((await f.exec("git", ["rev-parse", ref])).stdout).toBe(before);
      expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    } finally { await release(); }
    success(await store.write(input));
    expect(success(await store.read({ reference })).content).toBe("after lock");
  });
});
