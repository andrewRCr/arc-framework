import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type RecordVersion } from "../../src/lib/store/identity.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createRefLockFactory } from "../../src/lib/store/default-ports.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";

const provenance = { verb: "test-write", lifecycleAction: "update" };
const counter = (key: string) => RecordReferenceSchema.parse({ owner: { type: "project", name: "project" },
  kind: "project-registry/counter", key });

async function seededItem(format: "files" | "reftable") {
  const f = await createRefReadFixture(format);
  const primary = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" });
  const companion = RecordReferenceSchema.parse({ ...primary, kind: "work-item/companion", key: "extra" });
  const links = { branches: [{ repository: "repo", ref: "feat/alpha", linkedAs: "created" as const, excluded: [] }] };
  const result = await f.store.batch({ provenance, writes: [
    { action: "put", reference: primary, expected: null, content: makeMetaFixture("alpha"), placement: { kind: "active" }, links },
    { action: "put", reference: companion, expected: null, content: "kept" },
  ] });
  if (result.status !== "ok") throw new Error("No seeded item");
  const [meta, extra] = result.result.writes;
  if (!meta?.version || !extra?.version || meta.reference.owner.type !== "work-item" || !meta.reference.owner.uid) throw new Error("No seeded versions");
  return { ...f, links, ref: `refs/arc/work/${meta.reference.owner.uid}`, uid: meta.reference.owner.uid,
    primary: { reference: meta.reference, version: meta.version }, companion: { reference: extra.reference, version: extra.version } };
}

describe.each(["files", "reftable"] as const)("ref record construction (%s)", (format) => {
  it("stores two spellings of a never-projected JSON value as one canonical blob", async () => {
    const f = await createRefReadFixture(format);
    const first = counter("first");
    const second = counter("second");
    expect(await f.store.batch({ provenance, writes: [
      { action: "put", reference: first, expected: null, content: '{ "b": 2, "a": 1 }\n' },
      { action: "put", reference: second, expected: null, content: '{"a":1,"b":2}' },
    ] })).toMatchObject({ status: "ok" });
    const ref = "refs/arc/project/registry";
    const ids = (await f.exec("git", ["rev-parse", `${ref}:counters/first.json`, `${ref}:counters/second.json`])).stdout.split("\n");
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect((await f.exec("git", ["show", `${ref}:counters/first.json`])).stdout).toBe('{"a":1,"b":2}');
    expect(await f.store.read({ reference: first })).toMatchObject({ status: "ok", result: { content: '{"a":1,"b":2}' } });
    const metadata = JSON.parse((await f.exec("git", ["show", `${ref}:metadata-registry.json`])).stdout) as unknown;
    const canonicalMetadata = (await f.execInput(["hash-object", "--stdin"], canonicalize(metadata))).trim();
    expect((await f.exec("git", ["rev-parse", `${ref}:metadata-registry.json`])).stdout).toBe(canonicalMetadata);
  });
  it("preserves a personal document's exact bytes even when its key ends in json", async () => {
    const f = await createRefReadFixture(format);
    const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" },
      kind: "personal/document", key: "notes.json" });
    const content = '{ "b": 2, "a": 1 }\n\n';
    const result = await f.store.write({ action: "put", reference, expected: null, content, provenance });
    expect(result).toMatchObject({ status: "ok", result: { version: expect.any(String) } });
    expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { content } });
    const blob = (await f.exec("git", ["rev-parse", "refs/arc/user/andrew/personal:andrew/notes.json"])).stdout;
    const expected = (await f.execInput(["hash-object", "--stdin"], content)).trim();
    expect(blob).toBe(expected);
  });
  it("changes only the primary's record version for a metadata-only update", async () => {
    const f = await seededItem(format);
    const blob = (await f.exec("git", ["rev-parse", `${f.ref}:meta-alpha.md`])).stdout;
    const links = { branches: [{ ...f.links.branches[0]!, ref: "feat/relinked" }] };
    const result = await f.store.write({ action: "put", reference: f.primary.reference, expected: f.primary.version,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, links, provenance });
    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("No updated primary");
    expect(result.result.version).not.toBe(f.primary.version);
    expect((await f.exec("git", ["rev-parse", `${f.ref}:meta-alpha.md`])).stdout).toBe(blob);
    expect(await f.store.read({ reference: f.primary.reference })).toMatchObject({ status: "ok", result: {
      content: makeMetaFixture("alpha"), version: result.result.version, links,
    } });
    expect(await f.store.read({ reference: f.companion.reference })).toMatchObject({ status: "ok", result: {
      content: "kept", version: f.companion.version,
    } });
  });
  it.each(["primary", "companion"] as const)("commits %s removal while retaining the item's other records and primary facts", async (target) => {
    const f = await seededItem(format);
    const removed = f[target];
    const kept = target === "primary" ? f.companion : f.primary;
    const before = (await f.exec("git", ["rev-parse", f.ref])).stdout;
    expect(await f.store.write({ action: "remove", reference: removed.reference, expected: removed.version, provenance }))
      .toEqual({ status: "ok", result: { reference: removed.reference, conflicts: [] } });
    expect((await f.exec("git", ["rev-parse", f.ref])).stdout).not.toBe(before);
    expect(await f.store.read({ reference: removed.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await f.store.read({ reference: kept.reference })).toMatchObject({ status: "ok", result: {
      version: kept.version, content: target === "primary" ? "kept" : makeMetaFixture("alpha"), placement: { kind: "active" },
    } });
    expect(JSON.parse((await f.exec("git", ["show", `${f.ref}:metadata-${f.uid}.json`])).stdout))
      .toMatchObject({ primary: { role: "work-item/meta", placement: { kind: "active" }, links: f.links } });
  });
  it("retries a bypassing writer's ref change under the same lock and preserves its other records", async () => {
    const f = await seededItem(format);
    const native = createRefLockFactory(f.ports);
    const lockPath = join(f.root, ".git", "arc", "locks", `${f.ref}.lock`);
    const metadata = (await f.exec("git", ["show", `${f.ref}:metadata-${f.uid}.json`])).stdout;
    let compete = true;
    let competingTip = "";
    const tokens: string[] = [];
    const store = createRefStore({ ...f.ports, lock: native, execInput: async (args, input, options) => {
      if (args.includes("update-ref")) {
        const held = JSON.parse(await readFile(lockPath, "utf8")) as { token: string };
        tokens.push(held.token);
        if (compete) {
          compete = false;
          const tip = (await f.exec("git", ["rev-parse", f.ref])).stdout;
          const competing = await plantRef(f.root, f.ref, [
            { path: `metadata-${f.uid}.json`, content: metadata },
            { path: "meta-alpha.md", content: makeMetaFixture("alpha") },
            { path: "extra-alpha.md", content: "kept" },
            { path: "outsider-alpha.md", content: "competing write" },
          ], { parents: [tip] });
          competingTip = competing.tip;
        }
      }
      return f.ports.execInput(args, input, options);
    } });
    const reference = RecordReferenceSchema.parse({ ...f.companion.reference, key: "retry" });
    const result = await store.write({ action: "put", reference, expected: null, content: "retried write", provenance });
    expect(result).toMatchObject({ status: "ok" });
    expect(await store.read({ reference })).toMatchObject({ status: "ok", result: { content: "retried write" } });
    expect((await f.exec("git", ["show", `${f.ref}:outsider-alpha.md`])).stdout).toBe("competing write");
    expect((await f.exec("git", ["rev-parse", `${f.ref}^`])).stdout).toBe(competingTip);
    expect(tokens).toHaveLength(2);
    expect(new Set(tokens).size).toBe(1);
  });
  it("advances the saved-state token for every changed write and removal", async () => {
    const f = await createRefReadFixture(format);
    const initial = await f.store.version();
    if (initial.status !== "ok") throw new Error("No initial state token");
    const states = new Set<string>([initial.result]);
    const reference = counter("changing");
    let expected: RecordVersion | undefined;
    for (const content of ['{"value":1}', '{"value":2}', null, '{"value":3}']) {
      if (content === null) {
        if (!expected) throw new Error("No removal version");
        expect(await f.store.write({ action: "remove", reference, expected, provenance })).toMatchObject({ status: "ok" });
        expected = undefined;
      } else {
        const written = await f.store.write({ action: "put", reference, expected: expected ?? null, content, provenance });
        if (written.status !== "ok" || !written.result.version) throw new Error("No changed record version");
        expected = written.result.version;
      }
      const token = await f.store.version();
      if (token.status !== "ok") throw new Error("No saved state token");
      expect(states.has(token.result)).toBe(false);
      states.add(token.result);
    }
    expect(states.size).toBe(5);
  });
});
