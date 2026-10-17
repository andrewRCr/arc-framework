/** Real stored-state refusals and forward repairs for ref conformance fixtures. */
import { randomUUID } from "node:crypto";
import { RecordReferenceSchema, StateVersionSchema } from "../../../src/lib/store/index.js";
import { expandStoredPath } from "../../../src/lib/store/stored-path.js";
import { seed, success, update } from "./suite-tools.js";
import type { RecoveryCaseId, RecoveryOperation } from "./fixture-contract.js";
import type { RefConformanceFixture } from "./ref-fixture.js";
import { capturedEntries } from "./ref-fixture-plant.js";
import { plantRef } from "./ref-plant.js";
import { makeGitExec } from "../integration.js";

export function createRefRecovery(fixture: RefConformanceFixture) {
  const repairs = new Map<RecoveryCaseId, () => Promise<void>>();
  const base = makeGitExec(fixture.root);
  const git: typeof base = (command, args, options) => base(command, [...fixture.gitDir ? [`--git-dir=${fixture.gitDir}`] : [], ...args], options);
  async function produce(id: RecoveryCaseId): Promise<RecoveryOperation> {
    if (id === "not-found:name") {
      const reference = fixture.reference("work-item/meta", "missing");
      repairs.set(id, async () => { await seed(fixture, reference); });
      return { run: () => fixture.store.lookup({ kind: "slug", slug: reference.owner.name }) };
    }
    if (id === "not-found:identity") {
      const record = await seed(fixture, fixture.reference("personal/document"));
      fixture.identity(undefined);
      repairs.set(id, async () => { fixture.identity(record.reference.owner.name); });
      return { run: () => fixture.store.read({ reference: record.reference }) };
    }
    if (id === "unsupported:held-here") {
      await seed(fixture, fixture.reference("work-item/meta"));
      let heldHere = true;
      repairs.set(id, async () => { heldHere = false; });
      return { run: () => fixture.store.list({ family: "work-item", filter: { heldHere } }) };
    }
    if (id === "state-unresolvable") {
      const record = await seed(fixture, fixture.reference("work-item/meta"));
      let asOf = StateVersionSchema.parse("unavailable-ref-state");
      repairs.set(id, async () => { asOf = success(await fixture.store.version()); });
      return { run: () => fixture.store.read({ reference: record.reference, asOf }) };
    }
    if (id === "ambiguous-match") {
      const branch = { repository: "ambiguous-repository", ref: "shared-branch", linkedAs: "created" as const, excluded: [] };
      await seed(fixture, fixture.reference("work-item/meta"), undefined, { kind: "active" }, { branches: [branch] });
      const second = await seed(fixture, fixture.reference("work-item/meta", "two"), undefined, { kind: "active" }, { branches: [branch] });
      repairs.set(id, async () => { success(await fixture.store.write({ action: "remove", reference: second.reference, expected: second.version,
        provenance: { verb: "remove", lifecycleAction: "remove" } })); });
      return { run: () => fixture.store.lookup({ kind: "ref", ...branch }) };
    }
    if (id === "identity-mismatch") {
      const record = await seed(fixture, fixture.reference("project-registry/identity"));
      let reference = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, uid: randomUUID() } });
      repairs.set(id, async () => { reference = record.reference; });
      return { run: () => fixture.store.read({ reference }) };
    }
    if (id === "unreachable" || id === "refused" || id === "retries-exhausted") {
      fixture.remote(true);
      await seed(fixture, fixture.reference("work-item/meta"));
      fixture.remoteState(id === "unreachable" ? "down" : id === "refused" ? "refusing" : "contended");
      repairs.set(id, async () => { fixture.remoteState("available"); });
      return { run: () => fixture.store.push() };
    }
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    let mutation = update(fixture, record);
    if (id === "version-conflict") {
      success(await fixture.store.write(update(fixture, record)));
      repairs.set(id, async () => { mutation = update(fixture, success(await fixture.store.read({ reference: record.reference }))); });
    } else if (id === "record-malformed") {
      mutation = update(fixture, record, fixture.content(record.reference, "invalid"));
      repairs.set(id, async () => { mutation = update(fixture, record); });
    } else if (id === "lock-held") {
      await fixture.hold(record.reference, true);
      repairs.set(id, () => Promise.resolve(fixture.hold(record.reference, false)));
    } else if (id === "namespace-corrupt") {
      const home = expandStoredPath(record.reference, { registry: fixture.ports.registry });
      const saved = await capturedEntries(fixture, home.ref);
      {
        const parent = (await git("git", ["rev-parse", home.ref])).stdout;
        await plantRef(fixture.root, home.ref, saved.map((entry) => entry.path === home.metadataPath
          ? { path: entry.path, content: "broken metadata" } : entry), { parents: [parent], gitDir: fixture.gitDir });
      }
      repairs.set(id, async () => {
        const parent = (await git("git", ["rev-parse", home.ref])).stdout;
        await plantRef(fixture.root, home.ref, saved, { parents: [parent], gitDir: fixture.gitDir });
      });
      return { run: () => fixture.store.read({ reference: RecordReferenceSchema.parse(record.reference) }) };
    } else throw new Error(`The ref fixture cannot produce ${id}; declare its reasoned exclusion.`);
    return { run: () => fixture.store.write(mutation) };
  }
  return { produce, async repair(id: RecoveryCaseId): Promise<void> {
    const repair = repairs.get(id);
    if (!repair) throw new Error(`No produced refusal to repair: ${id}`);
    await repair();
  } };
}
