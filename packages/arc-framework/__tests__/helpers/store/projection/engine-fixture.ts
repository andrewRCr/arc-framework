/** A real checkout with a reference-store projection and its required ignore policy. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createExecaGitExec } from "../../../../src/lib/git/process-executor.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { createReferenceFixture } from "../reference-fixture.js";
import { seed, success } from "../suite-tools.js";
import { seedProjection } from "./seeded-projection.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";
import type { KindId } from "../../../../src/lib/store/catalog.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { makeMetaFixture } from "../../meta-fixture.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../bound-checkout.js";

export async function createEngineFixture(directories: string[], input: { path?: string; kind?: KindId; content?: string; extraPaths?: readonly string[];
  registryOverrides?: Parameters<typeof createReferenceFixture>[1] } = {}) {
  const fixture = createReferenceFixture(undefined, { ...(input.kind === "work-item/task-list"
    ? { "work-item/meta": { parser: META_REGISTRATION.parser } } : {}), ...input.registryOverrides });
  const reference = fixture.reference;
  fixture.reference = (kind, suffix) => {
    const selected = reference(kind, suffix);
    return selected.owner.type === "person" ? { ...selected, owner: { ...selected.owner, name: SlugSchema.parse("andrew") } } : selected;
  };
  fixture.identity("andrew");
  const primary = input.kind === "work-item/task-list" ? await seed(fixture, fixture.reference("work-item/meta"),
    makeMetaFixture("work-item-one", { owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" })) : null;
  const record = await seed(fixture, fixture.reference(input.kind ?? "personal/document"), input.content ?? "opening\nbase\nclosing\n");
  const path = input.path ?? ".arc/user/andrew/document.md";
  const extra = await Promise.all((input.extraPaths ?? []).map(async (path, i) => ({ path,
    record: await seed(fixture, fixture.reference("personal/document", `extra-${i}`), "extra base\n") })));
  const seeded = await seedProjection({ store: fixture.store, files: [{ reference: record.reference, path },
    ...extra.map(({ path, record }) => ({ path, reference: record.reference }))] });
  directories.push(seeded.checkout);
  const exec = await configureEngineCheckout(seeded.checkout);
  if (primary !== null) await writeWorktreeMarker(seeded.checkout, { spawnedByArc: false, spawningIdentity: "andrew",
    createdAt: "2026-10-24T00:00:00Z", createdFor: boundWorkUnitSubject(primary) });
  const entry = seeded.index.entries[path];
  if (entry?.kind !== "record") throw new Error("missing seeded record");
  return { ...seeded, ...fixture, path, entry, record, exec, extra,
    ports: () => createProjectionEnginePorts(seeded.checkout),
    file: () => readFile(join(seeded.checkout, path), "utf8"),
    stored: async () => success(await fixture.store.read({ reference: record.reference })),
    disk: async (): Promise<ProjectionIndex> => {
      const disk = await readProjectionIndex(seeded.location, true);
      if (disk.kind !== "index") throw new Error("unusable test index");
      return disk.index;
    },
    edit: (content: string) => writeFile(join(seeded.checkout, path), path.endsWith(".md") ? renderStampedFile({ content, stamp: entry.base.blob }) : content) };
}

/** Interpose selected public store operations while preserving the backend's method receivers. */
export function overrideEngineStore(store: import("../../../../src/lib/store/contract.js").Store,
  overrides: Partial<import("../../../../src/lib/store/contract.js").Store>): import("../../../../src/lib/store/contract.js").Store {
  return new Proxy(store, { get(target, key) {
    const replaced: unknown = Reflect.get(overrides, key);
    if (replaced !== undefined) return replaced;
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

/** Install the same ignore and identity inputs a live projected checkout requires. */
export async function configureEngineCheckout(checkout: string) {
  const exec = createExecaGitExec();
  await exec("git", ["config", "arc.identity", "andrew"], { cwd: checkout });
  await writeFile(join(checkout, ".git/info/exclude"), ".arc/active/\n.arc/backlog/\n.arc/completed/\n.arc/system/.local/\n");
  await writeFile(join(checkout, ".gitignore"), ".arc/user/*/\n");
  await mkdir(join(checkout, ".arc/user"), { recursive: true });
  await writeFile(join(checkout, ".arc/user/.npmignore"), "*\n");
  return exec;
}

/** Give a file-backed fixture real Git topology before exercising command entry. */
export async function initializeEngineCheckout(checkout: string): Promise<void> {
  await createExecaGitExec()("git", ["init", "--quiet"], { cwd: checkout });
  await configureEngineCheckout(checkout);
}
