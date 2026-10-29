/** Two independently configured ref stores sharing one real bare origin; a starting state built on them is copied per test. */

import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, onTestFinished } from "vitest";
import { setupMultiClone } from "../multi-clone.js";
import { makeGitExec } from "../integration.js";
import { copyPreparedRepository, prepareRepositoryTemplate, type PreparedRepositoryShape, type PreparedRepositoryTemplate } from "../prepared-repository.js";
import { removeGitBackedDir } from "../temp-repo.js";
import { createRefStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts, createRefLockFactory } from "../../../src/lib/store/default-ports.js";
import { createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";
import { createRefClock } from "./ref-clock.js";

type RefSyncLayout = "default" | "separate";

/** What a copy's checkout continues from, so a test runs on as it would have on the state it was built from. */
export interface CheckoutCarry { actor: string; clock: number }

interface SyncTemplate { template: PreparedRepositoryTemplate; data: unknown; a: CheckoutCarry; b: CheckoutCarry }

const templates = new Map<string, Promise<SyncTemplate>>();
afterAll(async () => {
  for (const prepared of templates.values()) {
    const built = await prepared.catch(() => undefined);
    if (built) await removeGitBackedDir(built.template.root);
  }
});

export type RefSyncFixture = Awaited<ReturnType<typeof attachRefSync>>;

/** A fresh two-clone topology, which costs what a copy of it would. */
export async function refSyncFixture(layout: RefSyncLayout = "default"): Promise<RefSyncFixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-ref-sync-"));
  const cleanup = (): Promise<void> => removeGitBackedDir(root);
  onTestFinished(cleanup);
  await buildTopology(root, layout);
  return attachRefSync(root, layout, cleanup);
}

/**
 * Copy a two-clone state that `build` brings about on the first request for `key` in a file. `build` returns data
 * alone, whose paths each copy gets as its own; a state whose objects would name a path fails its template, since no
 * copy can rewrite one, and is built per test instead.
 */
export async function preparedRefSync<T extends object>(key: string, layout: RefSyncLayout,
  build: (h: RefSyncFixture) => Promise<T>): Promise<RefSyncFixture & T> {
  let prepared = templates.get(key);
  if (!prepared) { prepared = buildSyncTemplate(key, layout, build); templates.set(key, prepared); }
  const { template, data, a, b } = await prepared;
  const root = await copyPreparedRepository(template, syncShape(key));
  const cleanup = (): Promise<void> => removeGitBackedDir(root);
  onTestFinished(cleanup);
  return { ...attachRefSync(root, layout, cleanup, { a, b }), ...relocate(data, template.root, root) as T };
}

/** Bind a further independently configured clone to the fixture's actual state repository. */
export async function createRefSyncCheckout(root: string, layout: RefSyncLayout, origin: string) {
  await initRefSyncStore(root, layout, origin);
  return attachRefSyncCheckout(root, layout);
}

async function buildSyncTemplate<T extends object>(key: string, layout: RefSyncLayout,
  build: (h: RefSyncFixture) => Promise<T>): Promise<SyncTemplate> {
  const root = await mkdtemp(join(tmpdir(), "arc-ref-sync-"));
  try {
    let data: unknown, carried: { a: CheckoutCarry; b: CheckoutCarry } | undefined;
    const template = await prepareRepositoryTemplate(syncShape(key), async () => {
      await buildTopology(root, layout);
      const h = attachRefSync(root, layout, async () => {});
      data = structuredClone(await build(h));
      carried = { a: h.a.carry(), b: h.b.carry() };
      return root;
    });
    if (!carried) throw new Error("The prepared two-clone state carried no checkouts");
    return { template, data, ...carried };
  } catch (error) {
    await removeGitBackedDir(root);
    throw error;
  }
}

async function buildTopology(root: string, layout: RefSyncLayout): Promise<void> {
  const config = { "arc.identity": "andrew", ...(layout === "default" ? { "remote.origin.arc-state": "push" } : {}) };
  const topology = await setupMultiClone({ parent: root, cloneA: { config }, cloneB: { config } });
  for (const clone of [topology.cloneA, topology.cloneB]) await initRefSyncStore(clone, layout, topology.origin);
}

function attachRefSync(root: string, layout: RefSyncLayout, cleanup: () => Promise<void>, carried?: { a: CheckoutCarry; b: CheckoutCarry }) {
  const origin = join(root, "origin"), cloneA = join(root, "cloneA"), cloneB = join(root, "cloneB");
  return { origin, cloneA, cloneB, cleanup, a: attachRefSyncCheckout(cloneA, layout, carried?.a), b: attachRefSyncCheckout(cloneB, layout, carried?.b),
    remote: makeGitExec(origin), remoteName: layout === "default" ? "origin" : "backing" };
}

async function initRefSyncStore(root: string, layout: RefSyncLayout, origin: string): Promise<void> {
  if (layout !== "separate") return;
  const exec = makeGitExec(root), gitDir = join(root, ".git", "arc", "store");
  await exec("git", ["init", "--bare", "--ref-format=reftable", "--object-format=sha1", gitDir]);
  await exec("git", [`--git-dir=${gitDir}`, "remote", "add", "backing", origin]);
  await exec("git", [`--git-dir=${gitDir}`, "config", "remote.backing.arc-state", "push"]);
}

function attachRefSyncCheckout(root: string, layout: RefSyncLayout, carried?: CheckoutCarry) {
  const exec = makeGitExec(root), defaults = createDefaultStorePorts({ checkoutRoot: root, exec });
  const gitDir = layout === "separate" ? join(root, ".git", "arc", "store") : undefined;
  const actor = carried?.actor ?? `andrew@${randomUUID()}`, clock = createRefClock(carried ? new Date(carried.clock) : undefined);
  const ports: RefStorePorts = { ...defaults, backingRepository: async () => null, ...clock, rawExec: createExecaRawGitExec(root),
    actor: async () => actor, random: () => 0.5, lock: createRefLockFactory(defaults) };
  const git = async (args: string[]) => {
    const directory = join(root, ".git", "arc", "store");
    let selected: string | undefined;
    try { await defaults.fs.lstat(directory); selected = directory; }
    catch (error) { if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error; }
    return exec("git", [...selected ? [`--git-dir=${selected}`] : [], ...args]);
  };
  return { root, exec, git, gitDir, ports, store: createRefStore(ports), carry: (): CheckoutCarry => ({ actor, clock: clock.at().getTime() }) };
}

function syncShape(key: string): PreparedRepositoryShape {
  return { kind: "multi-clone", key };
}

/** Give a copy the template's data with each path naming the copy's root. */
function relocate(value: unknown, from: string, to: string): unknown {
  if (typeof value === "string") return value.replaceAll(from, to);
  if (Array.isArray(value)) return value.map(item => relocate(item, from, to));
  if (value instanceof Map) return new Map([...value].map(([key, item]) => [relocate(key, from, to), relocate(item, from, to)]));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relocate(item, from, to)]));
  return value;
}
