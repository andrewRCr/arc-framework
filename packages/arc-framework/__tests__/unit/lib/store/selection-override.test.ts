/** The in-repo override selects the operational store implementation a composition builds. */

import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { RefStorePorts, StorePorts } from "../../../../src/lib/store/ports.js";

const built = vi.hoisted(() => ({ inRepo: [] as unknown[], ref: [] as unknown[] }));
const versionOf = (backend: string) => async () => ({ status: "ok" as const, result: backend });
vi.mock("../../../../src/lib/store/in-repo/backend.js", () => ({
  createInRepoBackend: (ports: StorePorts) => { built.inRepo.push(ports); return { version: versionOf("in-repo") } as unknown as Store; },
}));
vi.mock("../../../../src/lib/store/ref/backend.js", () => ({
  createRefBackend: (ports: RefStorePorts) => { built.ref.push(ports); return { version: versionOf("ref") } as unknown as Store; },
}));

const { selectStore } = await import("../../../../src/lib/store/create.js");
const { projectionProcessState } = await import("../../../../src/lib/store/projection/process-state.js");

const checkoutRoot = resolve("/selected-checkout");

/** Ports whose Git answers as a supported release over a tree that tracks nothing, recording every other call. */
function ports(gitCalls: string[] = []): StorePorts {
  const refuse = async (): Promise<never> => { throw new Error("No file or lock access is expected"); };
  return {
    checkoutRoot,
    exec: async (_command, args) => {
      if (args[0] === "--version") return { stdout: "git version 2.53.0\n", stderr: "" };
      gitCalls.push(args.join(" "));
      return { stdout: "", stderr: "" };
    },
    execInput: async () => "",
    fs: { readFile: refuse, readdir: refuse, lstat: refuse, mkdir: refuse, writeFile: refuse, exclusiveCreate: refuse, unlink: refuse },
    clock: () => new Date(0),
    identity: async () => null,
    remote: async () => null,
    locks: { tracked: refuse, notes: refuse },
  };
}

beforeEach(() => {
  built.inRepo.length = 0;
  built.ref.length = 0;
  projectionProcessState().composedCapabilities.clear();
});

describe("operational store selection", () => {
  it("builds the in-repo implementation under the override, reading no Git to choose", async () => {
    const gitCalls: string[] = [];
    const callerPorts = ports(gitCalls);
    const store = selectStore(callerPorts, { ARC_IN_REPO_STORE: "1" });
    expect(store.capabilities.stateOffBranch).toBe(false);
    expect(projectionProcessState().composedCapabilities.get(checkoutRoot)).toBe(false);
    expect(await store.version()).toEqual({ status: "ok", result: "in-repo" });
    expect(built.inRepo).toEqual([callerPorts]);
    expect(built.ref).toEqual([]);
    expect(gitCalls).toEqual([]);
  });

  it.each([
    ["unset", {}],
    ["empty", { ARC_IN_REPO_STORE: "" }],
  ])("builds the ref backend from the caller's ports with the override %s", async (_case, environment) => {
    const store = selectStore(ports(), environment);
    expect(store.capabilities.stateOffBranch).toBe(true);
    expect(projectionProcessState().composedCapabilities.get(checkoutRoot)).toBe(true);
    expect(await store.version()).toEqual({ status: "ok", result: "ref" });
    expect(built.inRepo).toEqual([]);
    expect(built.ref).toEqual([expect.objectContaining({ checkoutRoot })]);
  });

  it("builds nothing before the store's first use", () => {
    selectStore(ports(), {});
    selectStore(ports(), { ARC_IN_REPO_STORE: "1" });
    expect(built).toEqual({ inRepo: [], ref: [] });
  });
});
