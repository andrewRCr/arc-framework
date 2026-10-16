import { describe, expect, it } from "vitest";

import { createRefStore } from "../../../../src/lib/store/create.js";
import type { RefStorePorts } from "../../../../src/lib/store/ports.js";

function observedPorts() {
  const calls: string[] = [];
  const unexpected = async (): Promise<never> => { calls.push("io"); throw new Error("Unexpected I/O"); };
  const ports: RefStorePorts = {
    exec: unexpected, execInput: unexpected, rawExec: unexpected,
    fs: { readFile: unexpected, readdir: unexpected, lstat: unexpected, mkdir: unexpected,
      writeFile: unexpected, exclusiveCreate: unexpected, unlink: unexpected },
    checkoutRoot: "/no-repository", identity: unexpected, actor: unexpected, lock: unexpected,
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
});
