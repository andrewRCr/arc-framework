import { createServer } from "node:http";
import type { Socket } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { pushRefs } from "../../src/lib/git/push.js";
import { makeGitExec, makeGitExecInput } from "../helpers/integration.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repositories() {
  const root = await mkdtemp(join(tmpdir(), "arc-push-"));
  roots.push(root);
  const local = join(root, "local");
  const remote = join(root, "remote");
  const exec = makeGitExec(local);
  const remoteExec = makeGitExec(remote);
  await makeGitExec(root)("git", ["init", "--bare", local]);
  await makeGitExec(root)("git", ["init", "--bare", remote]);
  const tree = (await makeGitExecInput(local)(["mktree"], "")).trim();
  const identity = ["-c", "user.name=Test", "-c", "user.email=test@example.com"];
  const first = (await exec("git", [...identity, "commit-tree", tree, "-m", "first"])).stdout.trim();
  const second = (await exec("git", [...identity, "commit-tree", tree, "-p", first, "-m", "second"])).stdout.trim();
  const tips = async () => {
    const { stdout } = await remoteExec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"]);
    return Object.fromEntries(stdout.split("\n").filter(Boolean).map((line) => line.split(" ")));
  };
  return { local, remote, exec, remoteExec, first, second, tips };
}

describe("leased porcelain pushes", () => {
  it("publishes two refs together and leaves both unchanged when one lease is stale", async () => {
    const { remote, exec, first, second, tips } = await repositories();
    const a = "refs/arc/a";
    const b = "refs/arc/b";
    const result = await pushRefs(exec, remote, [
      { ref: a, next: first, expected: null }, { ref: b, next: first, expected: null },
    ]);
    expect(result).toMatchObject({ status: "refs", refs: [{ ref: a, status: "ok" }, { ref: b, status: "ok" }] });
    expect(await tips()).toEqual({ [a]: first, [b]: first });
    await exec("git", ["push", remote, `${second}:${a}`]);

    const rejected = await pushRefs(exec, remote, [
      { ref: a, next: first, expected: first }, { ref: b, next: second, expected: first },
    ]);
    expect(rejected).toMatchObject({ status: "refs", refs: [
      { ref: a, status: "rejected", reason: "stale info" }, { ref: b, status: "atomic-collateral" },
    ] });
    expect(await tips()).toEqual({ [a]: second, [b]: first });
  });

  it("refuses a stale delete lease, then deletes with the remote's actual tip", async () => {
    const { remote, exec, first, second, tips } = await repositories();
    const ref = "refs/arc/delete";
    await exec("git", ["push", remote, `${first}:${ref}`]);
    const stale = await pushRefs(exec, remote, [{ ref, next: null, expected: second }]);
    const beforeRepair = await tips();
    const repaired = await pushRefs(exec, remote, [{ ref, next: null, expected: first }]);
    expect({ stale, beforeRepair, repaired, final: await tips() }).toMatchObject({
      stale: { status: "refs", refs: [{ ref, status: "rejected", reason: "stale info" }] },
      beforeRepair: { [ref]: first }, repaired: { status: "refs", refs: [{ ref, status: "ok" }] }, final: {},
    });
    expect(await tips()).toEqual({});
  });


  it("reports an already-published tip as ok without changing the remote", async () => {
    const { remote, exec, first, tips } = await repositories();
    const ref = "refs/arc/unchanged";
    await exec("git", ["push", remote, `${first}:${ref}`]);
    const result = await pushRefs(exec, remote, [{ ref, next: first, expected: first }]);
    expect(result).toMatchObject({ status: "refs", refs: [{ ref, status: "ok" }] });
    expect(await tips()).toEqual({ [ref]: first });
  });


  it("reports a receiver without atomic capability before sending either ref", async () => {
    const { remote, remoteExec, exec, first, tips } = await repositories();
    await remoteExec("git", ["config", "receive.advertiseAtomic", "false"]);
    const result = await pushRefs(exec, remote, [
      { ref: "refs/arc/a", next: first, expected: null }, { ref: "refs/arc/b", next: first, expected: null },
    ]);
    expect(result).toMatchObject({ status: "atomic-unsupported" });
    expect(await tips()).toEqual({});
  });


  it("keeps a server hook's refusal and succeeds once the hook is repaired", async () => {
    const { remote, exec, first, tips } = await repositories();
    const ref = "refs/arc/reviewed";
    const hook = join(remote, "hooks", "pre-receive");
    await writeFile(hook, "#!/bin/sh\necho 'policy: a reason from the server' >&2\nexit 1\n", { mode: 0o755 });
    const change = [{ ref, next: first, expected: null }];
    const refused = await pushRefs(exec, remote, change);
    const beforeRepair = await tips();
    await rm(hook);
    const repaired = await pushRefs(exec, remote, change);
    expect(refused).toMatchObject({ status: "refs", refs: [
      { ref, status: "remote-rejected", reason: "pre-receive hook declined" },
    ] });
    expect(refused.stderr).toContain("remote: policy: a reason from the server");
    expect(beforeRepair).toEqual({});
    expect(repaired).toMatchObject({ status: "refs", refs: [{ ref, status: "ok" }] });
    expect(await tips()).toEqual({ [ref]: first });
  });

  it("keeps a pre-push hook's text and succeeds once the hook is repaired", async () => {
    const { local, remote, exec, first, tips } = await repositories();
    const ref = "refs/arc/preflight";
    const hook = join(local, "hooks", "pre-push");
    await writeFile(hook, "#!/bin/sh\necho 'local hook: review required' >&2\nexit 1\n", { mode: 0o755 });
    const change = [{ ref, next: first, expected: null }];
    const refused = await pushRefs(exec, remote, change);
    const beforeRepair = await tips();
    await rm(hook);
    const repaired = await pushRefs(exec, remote, change);
    expect(refused).toMatchObject({ status: "hook-declined" });
    expect(refused.stderr).toContain("local hook: review required\n");
    expect(beforeRepair).toEqual({});
    expect(repaired).toMatchObject({ status: "refs", refs: [{ ref, status: "ok" }] });
    expect(await tips()).toEqual({ [ref]: first });
  });


  it("classifies an unreachable HTTP remote from its network failure", async () => {
    const { exec, first } = await repositories();
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP address");
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    const result = await pushRefs(exec, `http://127.0.0.1:${address.port}/repo`, [
      { ref: "refs/arc/a", next: first, expected: null },
    ]);
    expect(result).toMatchObject({ status: "unreachable", cause: "network" });
  });

  it("reports an aborted push as a timeout and closes its hung transport", async () => {
    const { exec, first } = await repositories();
    let admitted: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { admitted = resolve; });
    const sockets = new Set<Socket>();
    const server = createServer(() => admitted?.());
    server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP address");
    const controller = new AbortController();
    const pending = pushRefs(exec, `http://127.0.0.1:${address.port}/repo`, [
      { ref: "refs/arc/a", next: first, expected: null },
    ], { signal: controller.signal });
    try {
      await ready;
      controller.abort();
      expect(await pending).toMatchObject({ status: "unreachable", cause: "timeout" });
    } finally {
      controller.abort();
      await pending;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 10_000);


  it("does not overwrite an existing ref through a lease requiring absence", async () => {
    const { remote, exec, first, second, tips } = await repositories();
    const ref = "refs/arc/claimed";
    await exec("git", ["push", remote, `${first}:${ref}`]);
    const result = await pushRefs(exec, remote, [{ ref, next: second, expected: null }]);
    expect({ result, tips: await tips() }).toMatchObject({
      result: { status: "refs", refs: [{ ref, status: "rejected", reason: "stale info" }] },
      tips: { [ref]: first },
    });
  });


  it("runs hooks with stable diagnostics and terminal prompts disabled", async () => {
    const { local, remote, exec, first, tips } = await repositories();
    vi.stubEnv("LC_ALL", "C.UTF-8");
    vi.stubEnv("GIT_TERMINAL_PROMPT", "1");
    await writeFile(join(local, "hooks", "pre-push"),
      '#!/bin/sh\n[ "$LC_ALL" = C ] && [ "$GIT_TERMINAL_PROMPT" = 0 ]\n', { mode: 0o755 });
    const ref = "refs/arc/noninteractive";
    const result = await pushRefs(exec, remote, [{ ref, next: first, expected: null }]);
    expect(result).toMatchObject({ status: "refs", refs: [{ ref, status: "ok" }] });
    expect(await tips()).toEqual({ [ref]: first });
  });

});
