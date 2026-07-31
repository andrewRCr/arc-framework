import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  createDecomposeTransientClaimStore,
  type DecomposeTransientClaimStoreDeps,
} from "../../../src/lib/work-unit/decompose-transient-claim-store.js";
import { decomposeTransientClaimId } from "../../../src/lib/work-unit/decompose-transient-claim.js";

function binding(origin = "origin") {
  return {
    origin,
    candidateBranch: `chore/decompose-${origin}`,
    sourceHead: canonicalDigest(`${origin}-source`),
    resultBaseHead: canonicalDigest("base"),
    cutMapDigest: canonicalDigest(`${origin}-map`),
  };
}

function memoryStore() {
  const files = new Map<string, string>();
  const tails = new Map<string, Promise<unknown>>();
  let rejectedWrites = 0;
  const deps: DecomposeTransientClaimStoreDeps = {
    root: "/repo/.git/arc/transient-claims",
    read: async (path) => files.get(path) ?? null,
    list: async (root) => [...files.keys()]
      .filter((path) => path.startsWith(`${root}/`))
      .map((path) => path.slice(root.length + 1)),
    writeAtomic: async (path, value) => {
      if (rejectedWrites > 0) {
        rejectedWrites -= 1;
        throw new Error("injected atomic-write failure");
      }
      files.set(path, value);
    },
    withLock: async (path, operation) => {
      const prior = tails.get(path) ?? Promise.resolve();
      let release: () => void = () => undefined;
      const next = new Promise<void>((resolve) => {
        release = resolve;
      });
      tails.set(path, prior.then(() => next));
      await prior;
      try {
        return await operation();
      } finally {
        release();
      }
    },
  };
  return {
    store: createDecomposeTransientClaimStore(deps),
    files,
    rejectNextWrite: () => {
      rejectedWrites += 1;
    },
  };
}

describe("decomposition transient claim store", () => {
  it("stores one canonical record at the repository-common claim path", async () => {
    const { store, files } = memoryStore();
    const input = binding();
    const claimId = decomposeTransientClaimId(input);
    const acquired = await store.acquire(claimId, input);
    expect(acquired.status).toBe("acquired");
    expect([...files.keys()]).toEqual([
      `/repo/.git/arc/transient-claims/${claimId}.json`,
    ]);
    const stored = files.values().next().value as string;
    expect(stored.endsWith("\n")).toBe(false);
    expect(JSON.parse(stored)).toMatchObject({
      claimId,
      generation: 1,
      state: { kind: "pending" },
      registration: { kind: "unregistered" },
    });
    expect(await store.list()).toEqual({
      claims: [acquired.status === "acquired" ? acquired.claim : null].filter(Boolean),
      malformed: [],
    });
  });

  it("serializes one key without lost generations while independent keys proceed separately", async () => {
    const { store } = memoryStore();
    const first = binding("first");
    const second = binding("second");
    const firstId = decomposeTransientClaimId(first);
    const secondId = decomposeTransientClaimId(second);

    const [firstAcquire, firstRetry, secondAcquire] = await Promise.all([
      store.acquire(firstId, first),
      store.acquire(firstId, first),
      store.acquire(secondId, second),
    ]);
    expect([firstAcquire.status, firstRetry.status].sort()).toEqual([
      "acquired",
      "already-acquired-matching",
    ]);
    expect(secondAcquire.status).toBe("acquired");
  });

  it("serializes concurrent lifecycle retries without losing the persisted transition", async () => {
    const { store } = memoryStore();
    const input = binding();
    const claimId = decomposeTransientClaimId(input);
    const acquired = await store.acquire(claimId, input);
    if (acquired.status !== "acquired") throw new Error("expected acquisition");
    const path = "/repo/worktrees/candidate";
    const reservations = await Promise.all([
      store.reserve(claimId, 1, path),
      store.reserve(claimId, 1, path),
    ]);
    expect(reservations.map(({ status }) => status).sort()).toEqual([
      "already-reserved-matching",
      "reserved",
    ]);
  });

  it("keeps the prior exact state when an atomic replacement fails and releases the key lock", async () => {
    const { store, files, rejectNextWrite } = memoryStore();
    const input = binding();
    const claimId = decomposeTransientClaimId(input);
    const acquired = await store.acquire(claimId, input);
    if (acquired.status !== "acquired") throw new Error("expected acquisition");
    const claimPath = `/repo/.git/arc/transient-claims/${claimId}.json`;
    const before = files.get(claimPath);
    rejectNextWrite();
    await expect(store.reserve(claimId, 1, "/repo/worktrees/candidate"))
      .rejects.toThrow("injected atomic-write failure");
    expect(files.get(claimPath)).toBe(before);
    expect((await store.reserve(claimId, 1, "/repo/worktrees/candidate")).status).toBe("reserved");
  });

  it("fails closed when a canonical claim is stored under a mismatched key", async () => {
    const { store, files } = memoryStore();
    const input = binding();
    const claimId = decomposeTransientClaimId(input);
    await store.acquire(claimId, input);
    const canonicalPath = `/repo/.git/arc/transient-claims/${claimId}.json`;
    const value = files.get(canonicalPath);
    if (value === undefined) throw new Error("expected stored claim");
    files.delete(canonicalPath);
    files.set("/repo/.git/arc/transient-claims/foreign.json", value);
    expect(await store.list()).toEqual({ claims: [], malformed: ["foreign.json"] });
  });

  it("persists reserve and occupy transitions and fails closed on malformed stored bytes", async () => {
    const { store, files } = memoryStore();
    const input = binding();
    const claimId = decomposeTransientClaimId(input);
    const acquired = await store.acquire(claimId, input);
    if (acquired.status !== "acquired") throw new Error("expected acquisition");
    const path = "/repo/worktrees/candidate";
    const reserved = await store.reserve(claimId, 1, path);
    expect(reserved.status).toBe("reserved");
    const occupied = await store.occupy(claimId, 1, path, {
      registrations: [{ path, candidateBranch: input.candidateBranch, head: input.resultBaseHead }],
      branch: { candidateBranch: input.candidateBranch, head: input.resultBaseHead },
      marker: {
        claimId,
        generation: 1,
        candidateWorktree: acquired.claim.candidateWorktree,
      },
    });
    expect(occupied.status).toBe("occupied");

    files.set(`/repo/.git/arc/transient-claims/${claimId}.json`, "{broken");
    expect(await store.reserve(claimId, 1, path)).toEqual({
      status: "conflict",
      reason: "malformed-claim",
    });
  });

  it("retains an exact terminal until release, then advances one generation", async () => {
    const { store } = memoryStore();
    const input = binding();
    const claimId = decomposeTransientClaimId(input);
    const acquired = await store.acquire(claimId, input);
    if (acquired.status !== "acquired") throw new Error("expected acquisition");
    const path = "/repo/worktrees/candidate";
    await store.reserve(claimId, 1, path);
    await store.occupy(claimId, 1, path, {
      registrations: [{ path, candidateBranch: input.candidateBranch, head: input.resultBaseHead }],
      branch: { candidateBranch: input.candidateBranch, head: input.resultBaseHead },
      marker: {
        claimId,
        generation: 1,
        candidateWorktree: acquired.claim.candidateWorktree,
      },
    });
    const terminal = {
      kind: "landed" as const,
      receiptId: canonicalDigest("receipt"),
      candidateHead: canonicalDigest("candidate"),
    };
    const retired = await store.retire(claimId, 1, terminal);
    expect(retired.status).toBe("retired");
    expect((await store.acquire(claimId, input)).status).toBe("conflict");
    const released = await store.release(
      claimId,
      1,
      acquired.claim.candidateWorktree,
      path,
      { registrationAbsent: true, markerAbsent: true, branchOccupationAbsent: true },
    );
    expect(released.status).toBe("released");
    const next = await store.acquire(claimId, input);
    expect(next.status).toBe("acquired");
    if (next.status === "acquired") expect(next.claim.generation).toBe(2);
    expect((await store.retire(claimId, 1, terminal)).status).toBe("conflict");
  });

  it("persists a binding restatement under the claim lock", async () => {
    const { store, files } = memoryStore();
    const input = binding();
    const claimId = decomposeTransientClaimId(input);
    const acquired = await store.acquire(claimId, input);
    if (acquired.status !== "acquired") throw new Error("expected acquisition");
    const path = "/repo/worktrees/candidate";
    await store.reserve(claimId, 1, path);
    await store.occupy(claimId, 1, path, {
      registrations: [{ path, candidateBranch: input.candidateBranch, head: input.resultBaseHead }],
      branch: { candidateBranch: input.candidateBranch, head: input.resultBaseHead },
      marker: {
        claimId,
        generation: 1,
        candidateWorktree: acquired.claim.candidateWorktree,
      },
    });
    const next = {
      resultBaseHead: canonicalDigest("advanced-base"),
      cutMapDigest: canonicalDigest("advanced-map"),
    };
    const result = await store.restateBinding(claimId, 1, input, next);
    expect(result.status).toBe("restated");
    expect(JSON.parse(files.get(`/repo/.git/arc/transient-claims/${claimId}.json`) ?? "null"))
      .toMatchObject({ binding: { ...input, ...next } });
    expect((await store.restateBinding(claimId, 1, input, next)).status)
      .toBe("already-restated-matching");
  });
});
