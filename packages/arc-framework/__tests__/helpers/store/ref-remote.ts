/** Real origin controls and a peer store for ref-backend conformance. */
import { execFileSync } from "node:child_process";
import { existsSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRefStore, runStoreMigrate, RecordReferenceSchema, type Store } from "../../../src/lib/store/index.js";
import { createDefaultStorePorts, createRefLockFactory } from "../../../src/lib/store/default-ports.js";
import { createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";
import type { RemoteState } from "./fixture-contract.js";
import { createRefClock } from "./ref-clock.js";
import { PREPARED_REMOTE_PATH } from "../prepared-repository.js";
import { success } from "./suite-tools.js";

export const REF_PEER_PATH = ".arc-fixture/peer";

export function createRefRemote(root: string, ports: RefStorePorts, advance: (milliseconds: number) => void, gitDir?: string) {
  const origin = join(root, PREPARED_REMOTE_PATH), peer = join(root, REF_PEER_PATH);
  const peerDefaults = createDefaultStorePorts({ checkoutRoot: peer });
  const remoteName = gitDir ? "backing" : "origin";
  const directory = (checkout: string) => gitDir ? join(checkout, ".git/arc/store") : undefined;
  const git = (checkout: string, args: string[]) => execFileSync("git", [
    ...directory(checkout) ? [`--git-dir=${directory(checkout)}`] : [], ...args,
  ], { cwd: checkout, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const peerPorts: RefStorePorts = { ...peerDefaults, backingRepository: async () => null, ...createRefClock(), rawExec: createExecaRawGitExec(peer),
    registry: ports.registry, random: ports.random, identity: ports.identity,
    actor: async (identity) => `${identity}@00000000-0000-4000-8000-000000000002`, lock: createRefLockFactory(peerDefaults) };
  const peerStore = guard(createRefStore(peerPorts));
  const migrationPorts = [{ ...ports }, { ...peerPorts }];
  const rawExec = ports.exec;
  const unguarded = createRefStore({ ...ports });
  let pending = Promise.resolve(), state: RemoteState = "available", attempt = 0;
  const clock = ports.clock, sleep = ports.sleep;
  let expireAfterReads: number | undefined;
  ports.clock = () => {
    if (expireAfterReads !== undefined && expireAfterReads-- === 0) {
      expireAfterReads = undefined;
      advance(120_000);
    }
    return clock();
  };
  ports.sleep = { ...sleep, wait: async (milliseconds, signal) => {
    await sleep.wait(milliseconds, signal);
    // Read the completed wait's elapsed time first, then let time pass between attempts.
    if (state === "contended") expireAfterReads = 1;
  } };
  const originGit = (args: string[]) => execFileSync("git", args, { cwd: origin, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  ports.exec = async (command, args, options) => {
    await pending;
    if (state === "contended" && args.includes("push")) {
      const ref = "refs/arc/user/test-user/personal", tip = originGit(["rev-parse", ref]);
      const tree = originGit(["rev-parse", `${tip}^{tree}`]);
      const next = originGit(["-c", "user.name=Contender", "-c", "user.email=contender@example.com", "commit-tree", tree, "-p", tip, "-m", `Contender ${attempt++}`]);
      originGit(["update-ref", ref, next, tip]);
    }
    return rawExec(command, args, options);
  };
  const remoteStore: Store = Object.create(peerStore) as Store;
  for (const name of ["read", "list", "version", "history", "changes", "lookup"] as const) {
    // Each method retains its own input/output types; the assignment only decorates that same method.
    Object.assign(remoteStore, { [name]: async (...args: unknown[]) => {
      success(await peerStore.pull());
      const call = peerStore[name] as (...input: unknown[]) => Promise<unknown>;
      return call.apply(peerStore, args);
    } });
  }
  remoteStore.write = async (input) => {
    success(await peerStore.pull());
    const result = await peerStore.write(input);
    if (result.status === "ok") success(await peerStore.push());
    return result;
  };
  remoteStore.batch = async (input) => {
    success(await peerStore.pull());
    const result = await peerStore.batch(input);
    if (result.status === "ok") success(await peerStore.push());
    return result;
  };
  return {
    guard,
    remote(enabled: boolean): Store | undefined {
      for (const checkout of [root, peer]) {
        git(checkout, ["remote", "set-url", remoteName, origin]);
        git(checkout, ["config", `remote.${remoteName}.arc-state`, enabled ? "push" : "off"]);
      }
      if (!gitDir) {
        pending = pending.then(async () => {
          for (const selected of migrationPorts) {
            const result = await runStoreMigrate(selected);
            if (result.status !== "ok") throw new Error(`Fixture layout move refused: ${JSON.stringify(result)}`);
          }
        });
        void pending.catch(() => undefined);
      }
      return enabled ? remoteStore : undefined;
    },
    remoteState(value: RemoteState, message = "Remote policy requires a permitted writer."): void {
      const away = `${origin}-away`;
      if (existsSync(away)) renameSync(away, origin);
      const hook = join(origin, "hooks/pre-receive");
      if (existsSync(hook)) unlinkSync(hook);
      if (value === "contended" && state !== value) { pending = pending.then(prepareContention); void pending.catch(() => undefined); }
      state = value;
      expireAfterReads = undefined;
      if (value === "down") renameSync(origin, away);
      if (value === "refusing") writeFileSync(hook, `#!/bin/sh\nprintf '%s\\n' '${message.replaceAll("'", "'\\''")}' >&2\nexit 1\n`, { mode: 0o755 });
    },
  };
  function guard(store: Store): Store {
    const guarded = Object.create(store) as Store;
    for (const name of ["read", "list", "write", "batch", "version", "history", "changes", "lookup", "pull", "push", "maintain"] as const) {
      Object.assign(guarded, { [name]: async (...args: unknown[]) => {
        await pending;
        const operation = store[name] as (...input: unknown[]) => Promise<unknown>;
        return operation.apply(store, args);
      } });
    }
    return guarded;
  }
  async function prepareContention(): Promise<void> {
    const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "test-user" }, key: "contention-base.md" });
    success(await unguarded.write({ action: "put", reference, expected: null, content: "Shared basis\n", provenance: { verb: "user", lifecycleAction: "save" } }));
    git(root, ["push", remoteName, "refs/arc/user/test-user/personal:refs/arc/user/test-user/personal"]);
    success(await unguarded.write({ action: "put", reference: { ...reference, key: "unpublished.md" }, expected: null,
      content: "Local intent stays unpublished during contention\n", provenance: { verb: "user", lifecycleAction: "save" } }));
  }
}
