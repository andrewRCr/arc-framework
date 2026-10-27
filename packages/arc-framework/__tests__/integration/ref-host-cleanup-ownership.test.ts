/** Manual probes leave concurrent receiver generations outside their cleanup ownership. */
import { expect, it, onTestFinished } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { probeHostPolicy } from "../benchmarks/ref-host-access.js";
import { probeBackend } from "../benchmarks/ref-host-backend.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { createDefaultRefStorePorts, createRefStore } from "../../src/lib/store/index.js";
import { createRefTestRepository } from "../helpers/store/ref-plant.js";

const personal = "refs/arc/user/andrew/personal";

async function fixture(atomic: boolean) {
  const f = await createRefTestRepository();
  onTestFinished(f.cleanup);
  const remote = join(f.root, "policy.git"), evidence = join(f.root, "evidence");
  await mkdir(evidence);
  await f.exec("git", ["init", "--bare", "--initial-branch=main", remote]);
  await f.exec("git", ["push", remote, "HEAD:refs/heads/main"]);
  await f.exec("git", [`--git-dir=${remote}`, "config", "receive.advertiseAtomic", String(atomic)]);
  await writeFile(join(remote, "hooks", "pre-receive"), '#!/bin/sh\nwhile read old new ref; do\nif test "$ref" = refs/heads/main; then exit 1; fi\ndone\n', { mode: 0o755 });
  const main = (await f.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const tree = (await f.exec("git", ["rev-parse", "HEAD^{tree}"])).stdout.trim();
  const foreign = (await f.exec("git", [`--git-dir=${remote}`, "-c", "user.name=Concurrent writer", "-c", "user.email=concurrent@example.test",
    "commit-tree", tree, "-p", main, "-m", "Concurrent receiver generation"])).stdout.trim();
  const replace = async () => { await f.exec("git", [`--git-dir=${remote}`, "update-ref", personal, foreign]); };
  const actual = async () => (await f.exec("git", [`--git-dir=${remote}`, "rev-parse", personal])).stdout.trim();
  const exec = createExecaGitExec();
  const git = async (_label: string, cwd: string, args: string[]) => (await exec("git", args, { cwd, preserveOutput: true,
    interaction: { terminalPrompts: "forbidden", presenters: "forbidden", ambientStdin: "closed" } })).stdout;
  const store = (checkoutRoot: string) => createRefStore(createDefaultRefStorePorts({ checkoutRoot, backingRepository: async () => null }));
  return { ...f, remote, evidence, main, foreign, replace, actual, git, store };
}

it("preserves a foreign generation observed by the final policy cleanup after successful policy work", async () => {
  const f = await fixture(true);
  let pushes = 0, reads = 0, replaced = false;
  const transport = () => ({
    git: async (label: string, cwd: string, args: string[]) => {
      const result = await f.git(label, cwd, args);
      // The state-only push is followed by two capture reads, then its result verification.
      if (label === "policy-remote-tips" && pushes === 3 && ++reads === 3) { await f.replace(); replaced = true; }
      return result;
    },
    store: (path: string) => {
      const store = f.store(path), push = store.push;
      store.push = async input => { const result = await push(input); pushes++; return result; };
      return store;
    },
  });
  await expect(probeHostPolicy({ root: f.root, remote: f.remote + ".primary", evidence: f.evidence,
    settings: { policy: { remote: f.remote } }, owned: new Map(), atomic: true }, transport)).rejects.toThrow();
  expect(replaced).toBe(true);
  expect(await f.actual()).toBe(f.foreign);
  expect((await f.exec("git", [`--git-dir=${f.remote}`, "rev-parse", "refs/heads/main"])).stdout.trim()).toBe(f.main);
});

it("preserves a foreign generation after a refused policy bootstrap trial", async () => {
  const f = await fixture(false);
  let replaced = false;
  const transport = () => ({ git: f.git, store: (path: string) => {
    const store = f.store(path), push = store.push;
    store.push = async input => {
      const result = await push(input);
      if (!replaced) { await f.replace(); replaced = true; }
      return result;
    };
    return store;
  } });
  await expect(probeHostPolicy({ root: f.root, remote: f.remote + ".primary", evidence: f.evidence,
    settings: { policy: { remote: f.remote } }, owned: new Map(), atomic: false }, transport)).rejects.toThrow();
  expect(await f.actual()).toBe(f.foreign);
});

it("preserves a foreign generation through the backend's actual failed-bootstrap cleanup", async () => {
  const f = await fixture(false);
  let replaced = false;
  const store = (path: string) => {
    const store = f.store(path), push = store.push;
    store.push = async input => {
      const result = await push(input);
      if (!replaced) { await f.replace(); replaced = true; }
      return result;
    };
    return store;
  };
  await expect(probeBackend({ root: f.root, remote: f.remote, evidence: f.evidence, git: f.git,
    store, settings: {}, atomic: false })).rejects.toThrow();
  expect(await f.actual()).toBe(f.foreign);
});
