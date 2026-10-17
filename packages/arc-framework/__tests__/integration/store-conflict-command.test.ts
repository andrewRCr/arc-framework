import { describe, expect, it } from "vitest";
import { retainedConflictFixture } from "../helpers/store/retained-conflicts.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema, runStoreConflict, type StoreConflictInput } from "../../src/lib/store/index.js";

function input(reference: { kind: StoreConflictInput["kind"]; key?: unknown; owner: { type: string; uid?: string } }): StoreConflictInput {
  return { uid: reference.owner.uid!, kind: reference.kind, id: String(reference.key) };
}

describe.each(["default", "separate"] as const)("exact conflict command in %s", (layout) => {
  it.each(["resolved", "changed"] as const)("preserves a %s conflict basis racing an explicit discard", async (race) => {
    const h = await retainedConflictFixture(layout, "abandon"), reference = h.conflicts[0]!;
    const basis = success(await h.a.store.history({ reference }))[0]!;
    if (!basis.version) throw new Error("Expected a current conflict");
    const version = basis.version;
    const { tip, entries } = await capturedHistory(h);
    let armed = true;
    const ports = { ...h.a.ports, lock: async (...args: Parameters<typeof h.a.ports.lock>) => {
      if (armed && args[0] === h.history) {
        armed = false;
        if (race === "resolved") success(await h.a.store.write({ action: "remove", reference, expected: version, resolves: [reference],
          provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
        else {
          const conflict = JSON.parse(basis.content!);
          conflict.incoming.label.actor = "repair@another-machine";
          const path = `conflicts/${String(reference.key)}.json`;
          await plantRef(h.a.root, h.history, entries.map((entry) => entry.path === path ? { path, content: JSON.stringify(conflict) } : entry),
            { parents: [tip], gitDir: h.a.gitDir });
        }
      }
      return h.a.ports.lock(...args);
    } };
    const result = await runStoreConflict(ports, { ...input(reference), discard: true });
    if (race === "resolved") expect(result).toMatchObject({ status: "ok", result: { status: "absent" } });
    else {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
      expect(success(await runStoreConflict(h.a.ports, input(reference)))).toMatchObject({ status: "present",
        conflict: { incoming: { label: { actor: "repair@another-machine" } } } });
    }
    expect(armed).toBe(false);
  }, 60_000);

  it("preserves malformed and unavailable history refusals and inspects again after repair", async () => {
    const h = await retainedConflictFixture(layout, "abandon"), reference = h.conflicts[0]!;
    const path = `conflicts/${String(reference.key)}.json`;
    const { tip, entries } = await capturedHistory(h);
    await plantRef(h.a.root, h.history, entries.map((entry) => entry.path === path ? { path, content: "{}" } : entry),
      { parents: [tip], gitDir: h.a.gitDir });
    expect(await runStoreConflict(h.a.ports, input(reference))).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "conflict.content" } });
    await h.a.git(["update-ref", h.history, tip]);
    const oid = entries.find((entry) => entry.path === path)!.oid;
    const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
    const bytes = (await h.a.ports.rawExec([...scope, "cat-file", "blob", oid])).stdout;
    await removeLooseObject(h.a.root, oid, h.a.gitDir);
    const operandReference = RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name: input(reference).uid } });
    const original = await h.a.store.history({ reference: operandReference });
    expect(original.status).toBe("refused");
    expect(await runStoreConflict(h.a.ports, input(reference))).toEqual(original);
    await h.a.ports.rawExec([...scope, "hash-object", "-w", "-t", "blob", "--stdin"], { input: bytes });
    expect(success(await runStoreConflict(h.a.ports, input(reference)))).toMatchObject({ status: "present", reference });
  }, 60_000);

  it("discards the exact review alternative locally and reports its already resolved ID as absent", async () => {
    const h = await retainedConflictFixture(layout, "abandon");
    const reference = h.conflicts.find(({ kind }) => kind === "review/conflict-record")!;
    expect(success(await runStoreConflict(h.a.ports, { ...input(reference), discard: true }))).toEqual({ status: "discarded", reference });
    expect(success(await runStoreConflict(h.a.ports, input(reference)))).toMatchObject({ status: "absent" });
    expect(success(await runStoreConflict(h.a.ports, { ...input(reference), discard: true }))).toMatchObject({ status: "absent" });
    expect(await h.a.store.read({ reference: h.primary })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, 60_000);

  it("fetches only its named missing history once and preserves the original refusal on a failed fetch", async () => {
    const h = await retainedConflictFixture(layout, "abandon"), reference = h.conflicts[0]!;
    success(await h.a.store.push());
    await h.a.git(["update-ref", "-d", h.history]);
    const operandReference = RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name: input(reference).uid } });
    const original = await h.a.store.history({ reference: operandReference });
    await h.a.git(["remote", "set-url", h.remoteName, `${h.origin}/missing`]);
    expect(original).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", historyRefs: [h.history] } });
    let fetches = 0;
    const failed = { ...h.a.ports, exec: async (...args: Parameters<typeof h.a.ports.exec>) => {
      if (args[1].includes("fetch")) fetches++;
      return h.a.ports.exec(...args);
    } };
    expect(await runStoreConflict(failed, input(reference))).toEqual(expect.objectContaining(original));
    expect(fetches).toBe(1);
    await h.a.git(["remote", "set-url", h.remoteName, h.origin]);
    fetches = 0;
    const named: string[] = [];
    const repaired = { ...h.a.ports, exec: async (...args: Parameters<typeof h.a.ports.exec>) => {
      if (args[1].includes("fetch")) { fetches++; named.push(...args[1].filter((arg) => arg.startsWith("refs/arc/history/"))); }
      return h.a.ports.exec(...args);
    } };
    expect(success(await runStoreConflict(repaired, input(reference)))).toMatchObject({ status: "present", reference });
    expect(fetches).toBe(1);
    expect(named).toEqual([`${h.history}*:refs/arc-remotes/${h.remoteName}/history/work/${input(reference).uid}*`]);
  }, 60_000);

  it("inspects every actual kind and side through history, without publishing or changing the retired owner", async () => {
    const h = await retainedConflictFixture(layout, "decompose");
    const before = (await h.a.git(["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout;
    for (const reference of h.conflicts) {
      const present = success(await runStoreConflict(h.a.ports, input(reference)));
      const basis = success(await h.a.store.history({ reference }))[0]!;
      expect(present).toEqual({ status: "present", reference, version: basis.version, conflict: JSON.parse(basis.content!) });
    }
    expect((await h.a.git(["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout).toBe(before);
  }, 60_000);
});

async function capturedHistory(h: Awaited<ReturnType<typeof retainedConflictFixture>>) {
  const tip = (await h.a.git(["rev-parse", h.history])).stdout;
  const entries = (await h.a.git(["ls-tree", "-r", "-z", h.history])).stdout.split("\0").filter(Boolean).map((row) => {
    const match = /^100644 blob ([0-9a-f]+)\t(.+)$/su.exec(row);
    if (!match) throw new Error("Expected ordinary fixture records");
    return { mode: "100644" as const, oid: match[1]!, path: match[2]! };
  });
  return { tip, entries };
}
