/** Actual notes and transient-ref publication over a bare origin and second clone. */
import { execFileSync } from "node:child_process";
import { existsSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createStore, KIND_REGISTRY, RecordReferenceSchema, type Store, type RecordReference } from "../../../src/lib/store/index.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { runUserPull } from "../../../src/commands/user/push-fetch.js";
import { makeGitExec, makeUserIO } from "../integration.js";
import { withAdvisoryLock } from "../../../src/lib/advisory-lock.js";
import { getNotesLockPath } from "../../../src/lib/user-sync/notes-lock.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { syncFixture, syncErrandRef } from "./sync-fixture.js";
import type { RemoteState } from "./fixture-contract.js";
import { transientContent } from "./in-repo-substrates.js";

/** Construct the real topology and configure both public stores for fixture-selected identity and transport.
 * @returns Checkouts, synchronous control hooks and a remote-facing public Store.
 */
export async function inRepoRemote() {
  const h = await syncFixture();
  let enabled = false;
  let identity: string | undefined = "andrew";
  let state: RemoteState = "available";
  let counter = 0;
  let pending: Promise<void> = Promise.resolve();
  const remoteExec = makeGitExec(h.origin);
  for (const checkout of [h.a, h.b]) {
    await writeFile(join(checkout.root, ".git/info/exclude"), ".arc/user/\n");
    checkout.ports.identity = async () => identity === undefined ? null : SlugSchema.parse(identity);
    checkout.ports.remote = async () => { await pending; return enabled ? "origin" : null; };
    checkout.ports.locks.notes = async (operation) => withAdvisoryLock(await getNotesLockPath(checkout.exec, checkout.root, identity ?? "andrew"), operation, { maxWaitMs: 100 });
    let ticks = 0;
    checkout.ports.clock = () => new Date(Date.parse("2026-08-12T00:00:00Z") + ticks++ * 30);
    const write = checkout.ports.fs.writeFile;
    checkout.ports.fs.writeFile = async (path, content) => {
      if (basename(path) === "SESSION-NOTES.md") await ensureWorkspace(checkout.root, basename(dirname(path)));
      await write(path, content);
    };
  }
  const exec = h.a.ports.exec;
  h.a.ports.exec = async (command, args, options) => {
    if (state === "contended" && args[0] === "push" && args.some((arg) => arg.includes(syncErrandRef))) await advanceRemote();
    return exec(command, args, options);
  };
  const remoteStore = remoteFacingStore(createStore(h.b.ports), async (reference) => {
    if (KIND_REGISTRY[reference.kind].inRepo.substrate === "personal") {
      if (reference.kind === "personal/session-context") await ensureWorkspace(h.b.root, String(reference.key));
      await runUserPull({ cwd: h.b.root, io: makeUserIO(h.b.root), identity: "andrew", ...(reference.kind === "personal/session-context" ? { currentWuName: String(reference.key) } : {}) });
    } else if (KIND_REGISTRY[reference.kind].inRepo.substrate === "transient-identity") {
      await h.b.exec("git", ["fetch", "origin", `+${syncErrandRef}:${syncErrandRef}`]);
    }
  });
  async function advanceRemote() {
    const tip = (await remoteExec("git", ["rev-parse", syncErrandRef])).stdout.trim();
    const tree = (await remoteExec("git", ["rev-parse", `${tip}^{tree}`])).stdout.trim();
    const next = (await remoteExec("git", ["-c", "user.name=Remote contender", "-c", "user.email=remote@example.com", "commit-tree", tree, "-p", tip, "-m", `Concurrent remote update ${counter++}`])).stdout.trim();
    await remoteExec("git", ["update-ref", syncErrandRef, next, tip]);
  }
  return { ...h, remoteStore,
    remote(value: boolean) {
      enabled = value;
      if (value) pending = pending.then(async () => { await h.a.file("sync-anchor.md", "Personal conformance sync anchor\n"); });
      return value ? remoteStore : undefined;
    },
    identity(value: string | undefined) {
      identity = value;
      for (const root of [h.a.root, h.b.root]) {
        for (const name of ["arc.identity", "user.name"]) {
          if (value === undefined) execFileSync("git", ["config", "--unset-all", name], { cwd: root });
          else execFileSync("git", ["config", name, value], { cwd: root });
        }
      }
    },
    remoteState(value: RemoteState, message = "Remote policy requires a permitted writer.") {
      const away = `${h.origin}-away`;
      if (state === "down" && existsSync(away)) renameSync(away, h.origin);
      const hook = join(h.origin, "hooks/pre-receive");
      if (existsSync(hook)) unlinkSync(hook);
      if (value !== "available") seedPublishableErrand();
      state = value;
      if (value === "down") renameSync(h.origin, away);
      if (value === "refusing") {
        const quoted = `'${message.replaceAll("'", "'\\''")}'`;
        writeFileSync(hook, `#!/bin/sh\necho ${quoted} >&2\nexit 1\n`, { mode: 0o755 });
      }
    },
    restore() { if (existsSync(`${h.origin}-away`)) renameSync(`${h.origin}-away`, h.origin); },
  };
  function seedPublishableErrand() {
    const git = (args: string[], input?: string) => execFileSync("git", args, { cwd: h.a.root, input, encoding: "utf8" }).trim();
    let tip: string;
    try { tip = git(["rev-parse", "--verify", syncErrandRef]); }
    catch {
      const reference = RecordReferenceSchema.parse({ kind: "work-item/record", owner: { type: "work-item", name: "remote-probe" } });
      const oid = git(["hash-object", "-w", "--stdin"], transientContent(reference));
      const tree = git(["mktree"], `100644 blob ${oid}\tremote-probe\n`);
      tip = git(["commit-tree", tree, "-m", "Seed remote publication intent"]);
      git(["update-ref", syncErrandRef, tip, ""]);
    }
    git(["push", "origin", `${syncErrandRef}:${syncErrandRef}`]);
  }
}

async function ensureWorkspace(root: string, slug: string): Promise<void> {
  const path = join(root, ".arc/active", `meta-${slug}.md`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, makeMetaFixture(slug));
}

function remoteFacingStore(store: Store, prepare: (reference: RecordReference) => Promise<void>): Store {
  const remote: Store = Object.create(store) as Store;
  remote.read = async (input) => { await prepare(input.reference); return store.read(input); };
  remote.write = async (input) => {
    const result = await store.write(input);
    if (result.status === "ok" && KIND_REGISTRY[input.reference.kind].inRepo.substrate === "personal") await store.sync();
    return result;
  };
  return remote;
}
