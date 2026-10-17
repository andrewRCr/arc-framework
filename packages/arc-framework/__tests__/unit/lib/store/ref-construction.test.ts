import { describe, expect, it } from "vitest";

import { createRefStore } from "../../../../src/lib/store/create.js";
import { createKindRegistry, type KindId } from "../../../../src/lib/store/index.js";
import type { RefStorePorts } from "../../../../src/lib/store/ports.js";

function observedPorts() {
  const calls: string[] = [];
  const unexpected = async (): Promise<never> => { calls.push("io"); throw new Error("Unexpected I/O"); };
  const ports: RefStorePorts = {
    exec: unexpected, execInput: unexpected, rawExec: unexpected,
    fs: { readFile: unexpected, readdir: unexpected, lstat: unexpected, mkdir: unexpected,
      writeFile: unexpected, exclusiveCreate: unexpected, unlink: unexpected, rename: unexpected, removeDirectory: unexpected },
    checkoutRoot: "/no-repository", identity: unexpected, backingRepository: unexpected, actor: unexpected, lock: unexpected,
    clock: () => { calls.push("clock"); return new Date(0); },
    sleep: { wait: unexpected, bound: unexpected }, random: () => { calls.push("random"); return 0.5; },
  };
  return { ports, calls };
}

describe("ref store construction", () => {
  it("constructs a store without consulting any port", () => {
    const { ports, calls } = observedPorts();
    const store = createRefStore(ports);
    expect(calls).toEqual([]);
    expect(store.capabilities).toEqual({ stateOffBranch: true });
  });

  it.each<KindId>(["personal/document", "lineage/transition", "project-machinery/prose"])("rejects an anchor outside a singleton's own ref: %s", async (kind) => {
    const { ports, calls } = observedPorts();
    const registry = createKindRegistry();
    await expect(createRefStore({ ...ports, registry: { ...registry, [kind]: { ...registry[kind], anchorFields: ["anchor"] } } }).version()).rejects.toThrow(kind);
    expect(calls).toEqual([]);
  });

  it.each<[KindId, KindId]>([["work-item/meta", "review/candidate"], ["personal/inbox", "personal/working-memory"]])("rejects two anchored kinds sharing a ref: %s and %s", async (first, second) => {
    const { ports, calls } = observedPorts();
    const registry = createKindRegistry();
    const construct = () => createRefStore({ ...ports, registry: { ...registry,
      [first]: { ...registry[first], anchorFields: ["anchor"] }, [second]: { ...registry[second], anchorFields: ["anchor"] } } }).version();
    await expect(construct()).rejects.toThrow(first);
    await expect(construct()).rejects.toThrow(second);
    expect(calls).toEqual([]);
  });

  it("rejects two anchor fields on one kind", async () => {
    const { ports, calls } = observedPorts();
    const registry = createKindRegistry();
    await expect(createRefStore({ ...ports, registry: { ...registry,
      "work-item/meta": { ...registry["work-item/meta"], anchorFields: ["one", "two"] } } }).version()).rejects.toThrow("work-item/meta");
    expect(calls).toEqual([]);
  });
});
