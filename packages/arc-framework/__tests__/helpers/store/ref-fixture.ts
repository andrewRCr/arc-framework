/** Real-Git conformance fixture over an independent prepared repository copy. */
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterAll, onTestFinished } from "vitest";
import type { ConformanceFixture, ConformanceRegistration, FixtureDeclarations } from "./fixture-contract.js";
import { FAMILY_IDS, FAMILY_REGISTRY, KIND_SHAPES, RecordReferenceSchema, familyOf, type KindDefinition, type KindId } from "../../../src/lib/store/index.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";
import { createRefStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts, createRefLockFactory } from "../../../src/lib/store/default-ports.js";
import { createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import { readGitDirectories } from "../../../src/lib/git/directories.js";
import { expandStoredPath } from "../../../src/lib/store/stored-path.js";
import { createRefRemote, REF_PEER_PATH } from "./ref-remote.js";
import { createRefRecovery } from "./ref-recovery.js";
import { SlugSchema } from "../../../src/lib/kernel/schema/slug.js";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { referenceContent, referenceDeclarations } from "./reference-fixture.js";
import { createConformanceTestRegistry } from "./test-registry.js";
import { createRefClock } from "./ref-clock.js";
import { plantRefFixtureFault } from "./ref-fixture-plant.js";
import { refFamilyExclusions } from "./ref-exclusions.js";
import { createTempRepoCore, removeGitBackedDir } from "../temp-repo.js";
import { makeGitExec } from "../integration.js";
import { copyPreparedRepository, prepareRepositoryTemplate, PREPARED_REMOTE_PATH, type PreparedRepositoryTemplate } from "../prepared-repository.js";

const families = FAMILY_IDS.filter((family) => family !== "project-machinery" && family !== "constitution");
export const refDeclarations: FixtureDeclarations = {
  ...referenceDeclarations, families,
  unservedFamilies: { "project-machinery": "Tracked in the standard profile.", constitution: "Tracked in the standard profile." },
  substrates: ["refs"], syncFamilies: families, syncRetryCount: 1, syncWaitedMs: 0,
  identitySyncFamilies: families.filter((family) => FAMILY_REGISTRY[family].scope === "identity"),
  familyExclusions: refFamilyExclusions(families),
  rejectingContentUnavailable: Object.fromEntries(Object.entries(referenceDeclarations.rejectingContentUnavailable)
    .filter(([kind]) => families.some((family) => family === familyOf(kind as KindId)))),
};

export type RefFixtureLayout = "default" | "separate";
const templates = new Map<RefFixtureLayout, Promise<PreparedRepositoryTemplate>>();
const templateShape = (layout: RefFixtureLayout) => ({ kind: "remote-bearing", key: `ref-${layout}-files` } as const);
afterAll(async () => { for (const template of templates.values()) await removeGitBackedDir((await template).root); });

async function buildTemplate(layout: RefFixtureLayout): Promise<string> {
  const root = await createTempRepoCore({ prefix: "arc-ref-conformance-", refFormat: "files" });
  try {
    const git = makeGitExec(root);
    await git("git", ["commit", "--allow-empty", "-m", "Prepared code seed"]);
    const remote = join(root, PREPARED_REMOTE_PATH);
    await mkdir(dirname(remote), { recursive: true });
    await git("git", ["init", "--bare", "--initial-branch=main", remote]);
    await git("git", ["remote", "add", "origin", remote]);
    if (layout === "default") await git("git", ["config", "remote.origin.arc-state", "push"]);
    else {
      const store = join(root, ".git", "arc", "store");
      await mkdir(dirname(store), { recursive: true });
      await git("git", ["init", "--bare", "--ref-format=reftable", "--object-format=sha1", store]);
    }
    const peer = join(root, REF_PEER_PATH);
    await git("git", ["clone", "--quiet", root, peer]);
    await makeGitExec(peer)("git", ["config", "user.name", "Peer"]);
    await makeGitExec(peer)("git", ["config", "user.email", "peer@example.com"]);
    if (layout === "separate") {
      for (const checkout of [root, peer]) {
        const directory = join(checkout, ".git/arc/store");
        if (checkout === peer) await git("git", ["init", "--bare", "--ref-format=reftable", directory]);
        await git("git", [`--git-dir=${directory}`, "remote", "add", "backing", remote]);
        await git("git", [`--git-dir=${directory}`, "config", "remote.backing.arc-state", "off"]);
      }
    }
    return root;
  } catch (error) { await removeGitBackedDir(root); throw error; }
}

export interface RefConformanceFixture extends ConformanceFixture {
  root: string;
  ports: RefStorePorts;
  gitDir?: string;
}

export async function createRefFixture(registryOverrides: Partial<Record<KindId, Partial<KindDefinition>>> = {}, layout: RefFixtureLayout = "default"): Promise<RefConformanceFixture> {
  const shape = templateShape(layout);
  let template = templates.get(layout);
  if (!template) { template = prepareRepositoryTemplate(shape, () => buildTemplate(layout)); templates.set(layout, template); }
  const root = await copyPreparedRepository(await template, shape);
  const held = new Map<string, () => Promise<void>>();
  onTestFinished(async () => { for (const release of held.values()) await release(); await removeGitBackedDir(root); });
  const registry = createConformanceTestRegistry(refDeclarations.entryShapes, registryOverrides);
  const defaults = createDefaultStorePorts({ checkoutRoot: root });
  const native = createRefLockFactory(defaults);
  const { commonDir } = await readGitDirectories(root, defaults.fs);
  const gitDir = layout === "separate" ? join(commonDir, "arc", "store") : undefined;
  let identity: string | undefined = "test-user";
  const clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
  const ports: RefStorePorts = { ...defaults, backingRepository: async () => null, ...clock, rawExec: createExecaRawGitExec(root),
    registry, random: () => 0, identity: async () => identity === undefined ? null : SlugSchema.parse(identity),
    actor: async (identity) => `${identity}@00000000-0000-4000-8000-000000000001`, lock: (ref, wait) => native(ref, held.has(ref) ? 20 : wait) };
  const projectId = randomUUID();
  const remote = createRefRemote(root, ports, clock.advance, gitDir);
  const store = remote.guard(createRefStore(ports));
  const fixture: RefConformanceFixture = { root, ports, store, gitDir, declarations: refDeclarations,
    reference(kind, suffix = "one") {
      const shape = KIND_SHAPES[kind];
      const owner = { type: shape.owner, name: shape.owner === "person" ? "test-user" : shape.owner === "project" ? "project" : `${shape.owner}-${suffix}` };
      const key = kind === "work-item/companion" ? suffix : shape.key === "pass" ? { activity: "review", number: suffix === "two" ? 2 : 1 }
        : shape.key === "path" ? `scratch/${suffix}.md` : suffix;
      return RecordReferenceSchema.parse({ owner, kind, ...(shape.key === null ? {} : { key }) });
    },
    content(reference, variant = "valid") {
      if (variant !== "invalid" && reference.kind === "project-registry/identity") return canonicalize({ projectId });
      const content = referenceContent(reference, registry, variant);
      return variant !== "invalid" && registry[reference.kind].projection === "never" ? canonicalize(JSON.parse(content)) : content;
    },
    async settle() {
      const result = await store.version();
      if (result.status !== "ok") throw new Error("The fixture could not capture its state version");
      return result.result;
    },
    reopen: () => remote.guard(createRefStore(ports)),
    race: (left, right) => Promise.all([store.write(left), remote.guard(createRefStore(ports)).write(right)]),
    identity: (name) => { identity = name; },
    plant: (reference, kind) => plantRefFixtureFault({ root, ports, store, gitDir }, reference, kind),
    ...remote,
    async hold(reference, holding) {
      const ref = expandStoredPath(reference, { registry }).ref;
      if (holding) { if (!held.has(ref)) held.set(ref, await native(ref)); }
      else { const release = held.get(ref); if (release) { await release(); held.delete(ref); } }
    },
    produce: (id) => recovery.produce(id), repair: (id) => recovery.repair(id),
  };
  const recovery = createRefRecovery(fixture);
  return fixture;
}

export const refRegistration: ConformanceRegistration = { declarations: refDeclarations, create: createRefFixture };

export const separateRefRegistration: ConformanceRegistration = { declarations: refDeclarations, create: (overrides) => createRefFixture(overrides, "separate") };
