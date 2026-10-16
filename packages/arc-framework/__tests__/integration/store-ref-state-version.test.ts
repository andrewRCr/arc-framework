import { join } from "node:path";
import { makeGitExecInput } from "../helpers/integration.js";
import { describe, expect, it } from "vitest";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { updateRefTransaction } from "../../src/lib/git/ref-transaction.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef } from "../helpers/store/ref-plant.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const ref = `refs/arc/work/${uid}`;
const metadata = canonicalize({ formatVersion: 1, slug: "alpha", formats: {},
  primary: { role: "work-item/meta", placement: { kind: "active" } } });
const entries = [{ path: `metadata-${uid}.json`, content: metadata }, { path: "extra-alpha.md", content: "kept" }];

describe.each(["files", "reftable"] as const)("saved state versions (%s)", (format) => {
  it("writes and retains a changed manifest in three processes and reuses it in one", async () => {
    const f = await createRefReadFixture(format);
    await plantRef(f.root, ref, entries);
    const store = createRefStore({ ...f.ports,
      identity: async () => { throw new Error("Version must not resolve identity"); },
      actor: async () => { throw new Error("Version must not resolve actor"); },
    });
    const first = await store.version();
    expect(first).toMatchObject({ status: "ok", result: expect.stringMatching(/^[0-9a-f]{40}$/u) });
    expect(f.processes()).toBe(3);
    if (first.status !== "ok") throw new Error("No state version");
    expect((await f.exec("git", ["rev-parse", "refs/arc/tmp/version"])).stdout).toBe(first.result);
    expect((await f.exec("git", ["cat-file", "-t", first.result])).stdout).toBe("tree");
    const before = f.processes();
    expect(await store.version()).toEqual(first);
    expect(f.processes() - before).toBe(1);
  });
  it("returns a live listing token from its snapshot and writes it in six processes", async () => {
    const f = await createRefReadFixture(format);
    await plantRef(f.root, ref, entries);
    const listing = await f.store.list({ family: "work-item" });
    expect(listing).toMatchObject({ status: "ok", result: { status: "complete", asOf: expect.stringMatching(/^[0-9a-f]{40}$/u),
      records: [expect.objectContaining({ content: "kept" })], diagnostics: [], missed: false } });
    expect(f.processes()).toBe(6);
    if (listing.status !== "ok" || listing.result.status !== "complete") throw new Error("No complete listing");
    expect(await f.store.version()).toEqual({ status: "ok", result: listing.result.asOf });
    expect(f.processes()).toBe(7);
    expect(await f.store.list({ family: "work-item" })).toEqual(listing);
    expect(f.processes()).toBe(11);
  });

  it("returns its captured token when another checkout retains a newer manifest first", async () => {
    const f = await createRefReadFixture(format);
    const initial = await plantRef(f.root, ref, entries);
    const previous = await f.store.version();
    if (previous.status !== "ok") throw new Error("No initial token");
    const captured = await plantRef(f.root, ref, [...entries, { path: "revision", content: "captured" }], { parents: [initial.tip] });
    const newer = await plantRef(f.root, "refs/test/newer", [...entries, { path: "revision", content: "newer" }], { parents: [captured.tip] });
    const winner = await plantRef(f.root, "refs/test/winner", [{ path: `work/${uid}`, oid: newer.tip, mode: "160000" }]);
    const other = join(f.root, "other-checkout");
    await f.exec("git", ["worktree", "add", "--detach", other, "HEAD"]);
    const winnerInput = makeGitExecInput(other);
    let compete = true;
    const store = createRefStore({ ...f.ports, execInput: async (args, input, options) => {
      if (compete && args.includes("update-ref")) {
        compete = false;
        await winnerInput(["update-ref", "--stdin"], ["start", `update ${ref} ${newer.tip} ${captured.tip}`,
          `update refs/arc/tmp/version ${winner.tree} ${previous.result}`, "prepare", "commit", ""].join("\n"));
      }
      return f.ports.execInput(args, input, options);
    } });
    const result = await store.version();
    expect(result).toMatchObject({ status: "ok", result: expect.any(String) });
    if (result.status !== "ok") throw new Error("No captured token");
    expect((await f.exec("git", ["ls-tree", result.result, `work/${uid}`])).stdout).toContain(captured.tip);
    expect((await f.exec("git", ["rev-parse", "refs/arc/tmp/version"])).stdout).toBe(winner.tree);
    expect(await store.version()).toEqual({ status: "ok", result: winner.tree });
  });

  it("keeps a captured snapshot coherent when two namespaces advance after acquisition", async () => {
    const f = await createRefReadFixture(format);
    const cohortRef = "refs/arc/cohort/abcdef12-1234-4234-8234-123456789abc";
    const initial = await plantRef(f.root, ref, []);
    await f.exec("git", ["update-ref", cohortRef, initial.tip]);
    const next = await plantRef(f.root, "refs/test/next", [], { parents: [initial.tip] });
    let advance = true;
    const store = createRefStore({ ...f.ports, rawExec: async (args, options) => {
      const result = await f.ports.rawExec(args, options);
      if (advance && args[0] === "for-each-ref") {
        advance = false;
        const moved = await updateRefTransaction(f, [ref, cohortRef].map((ref) => ({ ref, next: next.tip, expected: initial.tip })));
        if (moved.status !== "committed") throw new Error("The coordinated writer lost its expected state");
      }
      return result;
    } });
    const token = await store.version();
    if (token.status !== "ok") throw new Error("No captured token");
    const ids = (await f.exec("git", ["ls-tree", "-r", "--format=%(objectname)", token.result])).stdout.split("\n");
    expect(ids).toEqual([initial.tip, initial.tip]);
    expect((await f.exec("git", ["rev-parse", ref])).stdout).toBe(next.tip);
    expect(await store.version()).not.toEqual(token);
  });

});
