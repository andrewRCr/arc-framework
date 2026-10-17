import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { lstat, writeFile } from "node:fs/promises";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { readGitDirectories } from "../../src/lib/git/directories.js";

const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
const write = { action: "put" as const, reference, expected: null, content: makeMetaFixture("alpha"),
  placement: { kind: "active" as const }, provenance: { verb: "start", lifecycleAction: "test" } };

describe("clone-wide ref designation", () => {
  it.each(["push-default", "lone", "origin", "other-push", "none", "reserved-backing"])("places a fresh store by %s", async (mode) => {
    const f = await createRefReadFixture();
    if (mode === "lone") await f.exec("git", ["remote", "rename", "origin", "team"]);
    if (mode === "none") await f.exec("git", ["remote", "remove", "origin"]);
    if (mode === "reserved-backing") await f.exec("git", ["remote", "rename", "origin", "backing"]);
    if (["push-default", "origin", "other-push"].includes(mode)) await f.exec("git", ["remote", "add", "team", f.remote]);
    if (mode === "push-default" || mode === "other-push") {
      await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
      await f.exec("git", ["config", "remote.team.arc-state", "push"]);
    }
    if (mode === "push-default") await f.exec("git", ["config", "remote.pushDefault", "team"]);
    const result = success(await f.store.write(write));
    const separate = ["none", "reserved-backing", "other-push"].includes(mode);
    const { commonDir } = await readGitDirectories(f.root, f.ports.fs), directory = join(commonDir, "arc", "store");
    if (separate) expect((await lstat(directory)).isDirectory()).toBe(true);
    else await expect(lstat(directory)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await f.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout.length > 0).toBe(!separate);
    expect(success(await f.store.read({ reference: result.reference })).content).toBe(write.content);
  });

  it("uses the primary worktree's code remote from a detached worktree with a conflicting private setting", async () => {
    const f = await createRefReadFixture(), linked = join(f.root, "linked");
    await f.exec("git", ["remote", "add", "team", f.remote]);
    await f.exec("git", ["config", "remote.team.arc-state", "off"]);
    await f.exec("git", ["config", "extensions.worktreeConfig", "true"]);
    await f.exec("git", ["config", "--worktree", "remote.pushDefault", "origin"]);
    await f.exec("git", ["worktree", "add", "--detach", linked, "HEAD"]);
    await f.exec("git", ["-C", linked, "config", "--worktree", "remote.pushDefault", "team"]);
    const ports = { ...f.ports, ...createDefaultStorePorts({ checkoutRoot: linked }), rawExec: createExecaRawGitExec(linked) };
    const store = createRefStore(ports), result = success(await store.write(write));
    expect((await f.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).not.toBe("");
    expect(success(await f.store.read({ reference: result.reference })).content).toBe(write.content);
  });

  it("reports both counted push remotes without fetching", async () => {
    const f = await createRefReadFixture();
    await f.exec("git", ["remote", "add", "team", f.remote]);
    await f.exec("git", ["config", "remote.team.arc-state", "push"]);
    expect(await f.store.pull()).toMatchObject({ status: "ok", result: { pulls: [], states: [
      { status: "designation-ambiguous", remotes: ["origin", "team"], remedy: { text: expect.stringMatching(/off/iu) } },
    ] } });
  });
  it("keeps state in the code repository after its designation changes", async () => {
    const f = await createRefReadFixture(), result = success(await f.store.write(write));
    await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    const observed = success(await f.store.read({ reference: result.reference }));
    success(await f.store.write({ ...write, reference: observed.reference, expected: observed.version, content: write.content + "\nUpdated.\n" }));
    const { commonDir } = await readGitDirectories(f.root, f.ports.fs);
    await expect(lstat(join(commonDir, "arc", "store"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(success(await f.store.read({ reference: observed.reference })).version).not.toBe(observed.version);
  });

  it("keeps an existing separate directory despite a code push designation", async () => {
    const f = await createRefReadFixture(), { commonDir } = await readGitDirectories(f.root, f.ports.fs);
    const directory = join(commonDir, "arc", "store");
    await f.exec("git", ["init", "--bare", "--ref-format=reftable", "--object-format=sha1", directory]);
    const result = success(await f.store.write(write));
    expect((await f.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
    expect(success(await f.store.read({ reference: result.reference })).content).toBe(write.content);
  });

  it("does not count a fork upstream's push beside the store's explicitly off backing remote", async () => {
    const f = await createRefReadFixture(), { commonDir } = await readGitDirectories(f.root, f.ports.fs);
    await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    await f.exec("git", ["remote", "add", "upstream", f.remote]);
    await f.exec("git", ["config", "remote.upstream.arc-state", "push"]);
    const directory = join(commonDir, "arc", "store");
    await f.exec("git", ["init", "--bare", "--ref-format=reftable", "--object-format=sha1", directory]);
    await f.exec("git", [`--git-dir=${directory}`, "remote", "add", "backing", f.remote]);
    await f.exec("git", [`--git-dir=${directory}`, "config", "remote.backing.arc-state", "off"]);
    expect(await f.store.pull()).toEqual({ status: "ok", result: { states: [{ status: "no-remote" }], pulls: [] } });
  });

  it("includes the person's global code-remote configuration", async () => {
    const f = await createRefReadFixture(), globalConfig = join(f.root, "global.gitconfig");
    await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
    await f.exec("git", ["remote", "add", "team", f.remote]);
    await f.exec("git", ["config", "remote.team.arc-state", "push"]);
    await writeFile(globalConfig, "[remote]\n\tpushDefault = team\n");
    vi.stubEnv("GIT_CONFIG_GLOBAL", globalConfig);
    try {
      success(await f.store.write(write));
      const { commonDir } = await readGitDirectories(f.root, f.ports.fs);
      await expect(lstat(join(commonDir, "arc", "store"))).rejects.toMatchObject({ code: "ENOENT" });
      expect((await f.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).not.toBe("");
    } finally { vi.unstubAllEnvs(); }
  });

});
