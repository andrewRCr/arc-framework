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
import { SlugSchema } from "../../../src/lib/kernel/schema/slug.js";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { referenceContent, referenceDeclarations } from "./reference-fixture.js";
import { createConformanceTestRegistry } from "./test-registry.js";
import { createRefClock } from "./ref-clock.js";
import { plantRefFixtureFault } from "./ref-fixture-plant.js";
import { createTempRepoCore, removeGitBackedDir } from "../temp-repo.js";
import { makeGitExec } from "../integration.js";
import { copyPreparedRepository, prepareRepositoryTemplate, PREPARED_REMOTE_PATH, type PreparedRepositoryTemplate } from "../prepared-repository.js";

const families = FAMILY_IDS.filter((family) => family !== "project-machinery" && family !== "constitution");
export const refDeclarations: FixtureDeclarations = {
  ...referenceDeclarations, families,
  unservedFamilies: { "project-machinery": "Tracked in the standard profile.", constitution: "Tracked in the standard profile." },
  substrates: ["refs"], syncFamilies: families,
  identitySyncFamilies: families.filter((family) => FAMILY_REGISTRY[family].scope === "identity"),
  familyExclusions: Object.fromEntries(families.map((family) => [family, { items: {
    5: "Every state ref is published in one Git transaction.", 8: "Ref state versions cover every served family.",
  } }])),
  rejectingContentUnavailable: Object.fromEntries(Object.entries(referenceDeclarations.rejectingContentUnavailable)
    .filter(([kind]) => families.some((family) => family === familyOf(kind as KindId)))),
};

const shape = { kind: "remote-bearing", key: "ref-default-files" } as const;
let template: Promise<PreparedRepositoryTemplate> | undefined;
afterAll(async () => { if (template) await removeGitBackedDir((await template).root); });

async function buildTemplate(): Promise<string> {
  const root = await createTempRepoCore({ prefix: "arc-ref-conformance-", refFormat: "files" });
  try {
    const git = makeGitExec(root);
    await git("git", ["commit", "--allow-empty", "-m", "Prepared code seed"]);
    const remote = join(root, PREPARED_REMOTE_PATH);
    await mkdir(dirname(remote), { recursive: true });
    await git("git", ["init", "--bare", "--initial-branch=main", remote]);
    await git("git", ["remote", "add", "origin", remote]);
    await git("git", ["config", "remote.origin.arc-state", "push"]);
    return root;
  } catch (error) { await removeGitBackedDir(root); throw error; }
}

export interface RefConformanceFixture extends ConformanceFixture {
  root: string;
  ports: RefStorePorts;
}

export async function createRefFixture(registryOverrides: Partial<Record<KindId, Partial<KindDefinition>>> = {}): Promise<RefConformanceFixture> {
  template ??= prepareRepositoryTemplate(shape, buildTemplate);
  const root = await copyPreparedRepository(await template, shape);
  onTestFinished(() => removeGitBackedDir(root));
  const registry = createConformanceTestRegistry(refDeclarations.entryShapes, registryOverrides);
  const defaults = createDefaultStorePorts({ checkoutRoot: root });
  let identity: string | undefined = "test-user";
  const ports: RefStorePorts = { ...defaults, ...createRefClock(), rawExec: createExecaRawGitExec(root),
    registry, random: () => 0.5, identity: async () => identity === undefined ? null : SlugSchema.parse(identity),
    actor: async (identity) => `${identity}@00000000-0000-4000-8000-000000000001`, lock: createRefLockFactory(defaults) };
  const projectId = randomUUID();
  const store = createRefStore(ports);
  const unavailable = (): never => { throw new Error("This conformance fixture hook is not implemented yet"); };
  return { root, ports, store, declarations: refDeclarations,
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
    reopen: () => createRefStore(ports),
    race: (left, right) => Promise.all([store.write(left), createRefStore(ports).write(right)]),
    identity: (name) => { identity = name; },
    plant: (reference, kind) => plantRefFixtureFault({ root, ports, store }, reference, kind),
    remote: unavailable, remoteState: unavailable, hold: unavailable, produce: unavailable, repair: unavailable,
  };
}

export const refRegistration: ConformanceRegistration = { declarations: refDeclarations, create: createRefFixture };
