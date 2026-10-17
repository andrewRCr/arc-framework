import { describe, expect, it, vi } from "vitest";
import { lstat, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createRefStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { readGitDirectories } from "../../src/lib/git/directories.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const primary = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
const write = { action: "put" as const, reference: primary, content: makeMetaFixture("alpha"), expected: null,
  placement: { kind: "active" as const }, provenance: { verb: "start", lifecycleAction: "test" } };

describe("the separate ref store directory", () => {
  it.each(["sha1", "sha256"] as const)("creates a local-only bare reftable store with %s objects", async (format) => {
    const f = await createRefReadFixture("files", undefined, format);
    await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    await f.exec("git", ["config", "user.name", "Code Person"]);
    await f.exec("git", ["config", "user.email", "code-person@example.test"]);
    const { commonDir } = await readGitDirectories(f.root, f.ports.fs), directory = join(commonDir, "arc", "store");
    const result = success(await f.store.write(write));
    expect((await lstat(directory)).isDirectory()).toBe(true);
    expect((await f.exec("git", [`--git-dir=${directory}`, "rev-parse", "--is-bare-repository"])).stdout).toBe("true");
    expect((await f.exec("git", [`--git-dir=${directory}`, "rev-parse", "--show-ref-format"])).stdout).toBe("reftable");
    expect((await f.exec("git", [`--git-dir=${directory}`, "rev-parse", "--show-object-format"])).stdout).toBe(format);
    expect((await f.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
    const stored = success(await f.store.read({ reference: result.reference }));
    expect(stored.content).toBe(write.content);
    if (result.reference.owner.type !== "work-item") throw new Error("Expected work-item owner");
    expect((await f.exec("git", [`--git-dir=${directory}`, "log", "-1", "--format=%an <%ae>|%cn <%ce>",
      `refs/arc/work/${result.reference.owner.uid}`])).stdout).toBe("Code Person <code-person@example.test>|Code Person <code-person@example.test>");
  });
  it("shares the one directory with a detached worktree without extra Git selection calls", async () => {
    const f = await createRefReadFixture();
    await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    const result = success(await f.store.write(write)), linked = join(f.root, "linked");
    await f.exec("git", ["worktree", "add", "--detach", linked, "HEAD"]);
    const store = createRefStore({ ...f.ports, ...createDefaultStorePorts({ checkoutRoot: linked }), rawExec: createExecaRawGitExec(linked) });
    const before = f.processes();
    expect(success(await f.store.read({ reference: result.reference })).content).toBe(write.content);
    expect(f.processes() - before).toBe(2);
    const observed = success(await store.read({ reference: result.reference }));
    success(await store.write({ ...write, reference: observed.reference, expected: observed.version, content: makeMetaFixture("alpha") + "\nChanged context.\n" }));
    expect(success(await f.store.read({ reference: observed.reference })).version).not.toBe(observed.version);
  });

  it("isolates stored objects from an inherited object-directory variable", async () => {
    const f = await createRefReadFixture();
    await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    const foreign = join(f.root, "foreign-objects");
    await mkdir(foreign);
    vi.stubEnv("GIT_OBJECT_DIRECTORY", foreign);
    try {
      const result = success(await f.store.write(write));
      expect(success(await f.store.read({ reference: result.reference })).content).toBe(write.content);
      expect(await readdir(foreign)).toEqual([]);
    } finally { vi.unstubAllEnvs(); }
  });

  it("cleans an interrupted installation and succeeds on retry", async () => {
    const f = await createRefReadFixture();
    await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    const { commonDir } = await readGitDirectories(f.root, f.ports.fs), directory = join(commonDir, "arc", "store");
    let fail = true;
    const store = createRefStore({ ...f.ports, fs: { ...f.ports.fs, rename: async (source, destination) => {
      if (fail) { fail = false; throw new Error("Interrupted directory installation"); }
      return f.ports.fs.rename(source, destination);
    } } });
    await expect(store.write(write)).rejects.toThrow("Interrupted directory installation");
    await expect(lstat(directory)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(join(commonDir, "arc"))).filter((name) => name.startsWith("store-init-"))).toEqual([]);
    const written = success(await store.write(write));
    expect(success(await store.read({ reference: written.reference })).content).toBe(write.content);
  });

  it("retains a missing tip as a diagnostic and a manifest entry beside a readable item", async () => {
    const f = await createRefReadFixture();
    await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    const first = success(await f.store.write(write));
    const beta = RecordReferenceSchema.parse({ kind: primary.kind, owner: { type: "work-item", name: "beta" } });
    const second = success(await f.store.write({ ...write, reference: beta, content: makeMetaFixture("beta") }));
    if (first.reference.owner.type !== "work-item") throw new Error("Expected work-item owner");
    const { commonDir } = await readGitDirectories(f.root, f.ports.fs), directory = join(commonDir, "arc", "store");
    const ref = `refs/arc/work/${first.reference.owner.uid}`;
    const tip = (await f.exec("git", [`--git-dir=${directory}`, "rev-parse", ref])).stdout;
    await removeLooseObject(directory, tip);
    expect(success(await f.store.list({ family: "work-item" }))).toMatchObject({ status: "complete", missed: true,
      records: [expect.objectContaining({ reference: second.reference })], diagnostics: [{ kind: "unreadable", key: ref }] });
    const version = success(await f.store.version());
    expect((await f.exec("git", [`--git-dir=${directory}`, "rev-parse", `${version}:work/${first.reference.owner.uid}`])).stdout).toBe(tip);
  });

});
