/** Commit deliberate storage defects while preserving the rest of each real ref tree. */
import { randomUUID } from "node:crypto";
import { expandStoredPath } from "../../../src/lib/store/stored-path.js";
import type { RecordReference } from "../../../src/lib/store/identity.js";
import type { PlantKind } from "./fixture-contract.js";
import type { RefConformanceFixture } from "./ref-fixture.js";
import { plantRef, removeLooseObject, type PlantTreeEntry } from "./ref-plant.js";
import { makeGitExec } from "../integration.js";
import { PROJECTED_RECORD_MAX_BYTES } from "../../../src/lib/store/limits.js";
import { KIND_REGISTRY } from "../../../src/lib/store/registry.js";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { OwnerIdentitySchema, RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { WholeRecordConflictSchema } from "../../../src/lib/store/conflict.js";

export async function plantRefFixtureFault(fixture: Pick<RefConformanceFixture, "root" | "ports" | "store">,
  reference: RecordReference, kind: PlantKind): Promise<void> {
  const current = await fixture.store.read({ reference });
  if (current.status !== "ok") throw new Error("A fixture fault requires an existing readable record");
  const home = expandStoredPath(current.result.reference, { registry: fixture.ports.registry });
  const git = makeGitExec(fixture.root);
  if (kind === "family-unreadable") {
    const family = (fixture.ports.registry?.[reference.kind] ?? KIND_REGISTRY[reference.kind]).family;
    const listing = await fixture.store.list({ family });
    if (listing.status !== "ok" || listing.result.status !== "complete") throw new Error("No readable fixture family to corrupt");
    const homes = listing.result.records.map((record) => expandStoredPath(record.reference, { registry: fixture.ports.registry }));
    for (const target of new Map(homes.map((home) => [home.ref, home])).values()) {
      const parent = (await git("git", ["rev-parse", target.ref])).stdout;
      const entries = await capturedEntries(fixture, target.ref);
      await plantRef(fixture.root, target.ref, entries.map((entry) => entry.path === target.metadataPath
        ? { path: target.metadataPath, content: "broken metadata" } : entry), { parents: [parent], allowMissingObjects: true });
    }
    return;
  }
  const parent = (await git("git", ["rev-parse", home.ref])).stdout;
  const entries = await capturedEntries(fixture, home.ref);
  if (kind === "key-mismatch") {
    const owner = current.result.reference.owner;
    if (reference.kind.endsWith("/conflict-record")) {
      const conflict = WholeRecordConflictSchema.parse(JSON.parse(current.result.content));
      const foreign = OwnerIdentitySchema.parse({ ...owner, name: "wrong-owner", ...("uid" in owner ? { uid: randomUUID() } : {}) });
      const target = RecordReferenceSchema.parse({ ...conflict.record, owner: foreign });
      const value = (record: typeof conflict.base) => record ? { ...record, reference: target } : null;
      const content = canonicalize({ ...conflict, record: target, base: value(conflict.base),
        current: { ...conflict.current, value: value(conflict.current.value) },
        incoming: { ...conflict.incoming, value: value(conflict.incoming.value) } });
      await plantRef(fixture.root, home.ref, entries.map((entry) => entry.path === home.path ? { path: home.path, content } : entry), { parents: [parent], allowMissingObjects: true });
    } else {
      const uid = "uid" in owner ? owner.uid : undefined;
      const path = reference.kind === "work-item/companion" ? "meta-wrong-owner.md"
        : uid && home.path.includes(uid) ? home.path.replaceAll(uid, randomUUID())
          : home.path.replaceAll(owner.name, "wrong-owner");
      if (path === home.path) throw new Error("The stored entry has no second owner coordinate to corrupt");
      await plantRef(fixture.root, home.ref, entries.map((entry) => entry.path === home.path
        ? { ...entry, path } : entry), { parents: [parent], allowMissingObjects: true });
    }
    return;
  }
  if (kind === "unknown-format-version") {
    const metadata = JSON.parse((await git("git", ["show", `${parent}:${home.metadataPath}`])).stdout) as { formats: Record<string, number> };
    const { kind: id, key, owner } = current.result.reference;
    metadata.formats[canonicalize({ kind: id, ...(key === undefined ? {} : { key }),
      ...(id === "lineage/transition" && owner.type === "work-item" ? { ownerUid: owner.uid } : {}) })]
      = (fixture.ports.registry?.[id] ?? KIND_REGISTRY[id]).formatVersion + 1;
    await plantRef(fixture.root, home.ref, entries.map((entry) => entry.path === home.metadataPath
      ? { path: home.metadataPath, content: canonicalize(metadata) } : entry), { parents: [parent], allowMissingObjects: true });
    return;
  }
  if (kind === "malformed") {
    const definition = fixture.ports.registry?.[reference.kind] ?? KIND_REGISTRY[reference.kind];
    const contentRefusal = definition.parser !== null || definition.projection === "never";
    const badPath = current.result.reference.owner.type === "work-item" ? `review/unmapped-${randomUUID()}`
      : `${home.root}unmapped-\u0001-${randomUUID()}`;
    await plantRef(fixture.root, home.ref, entries.map((entry) => entry.path !== home.path ? entry
      : contentRefusal ? { path: home.path, content: "invalid machine JSON" } : { ...entry, path: badPath }), { parents: [parent], allowMissingObjects: true });
    return;
  }
  const content = kind === "unreadable" ? `Unreadable fixture ${randomUUID()}` : kind === "oversized"
    ? "x".repeat(PROJECTED_RECORD_MAX_BYTES + 1) : null;
  if (content === null) throw new Error(`The ${kind} fixture fault is not implemented yet`);
  const planted = await plantRef(fixture.root, home.ref, entries.map((entry) => entry.path === home.path
    ? { path: home.path, content } : entry), { parents: [parent], allowMissingObjects: true });
  if (kind === "unreadable") {
    const blob = planted.blobs.get(home.path);
    if (!blob) throw new Error("The unique fault blob was not created");
    await removeLooseObject(fixture.root, blob);
  }
}

async function capturedEntries(fixture: Pick<RefConformanceFixture, "root" | "ports">, ref: string): Promise<PlantTreeEntry[]> {
  const { stdout } = await fixture.ports.rawExec(["ls-tree", "-rz", "--full-tree", ref], { objectAccess: "local-only" });
  return Buffer.from(stdout).toString("utf8").split("\0").filter(Boolean).map((row) => {
    const match = /^(100644|100755|120000|160000|040000) \w+ ([0-9a-f]+)\t(.*)$/su.exec(row);
    if (!match?.[1] || !match[2] || !match[3]) throw new Error("Malformed fixture tree entry");
    return { path: match[3], oid: match[2], mode: match[1] as "100644" | "100755" | "120000" | "160000" | "040000" };
  });
}
