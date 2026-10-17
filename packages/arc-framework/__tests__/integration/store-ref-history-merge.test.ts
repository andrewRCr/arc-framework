import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { renderStoreCommitMessage } from "../../src/lib/store/commit-provenance.js";

describe("ordered ref merge history", () => {
  it.each(["remote", "local"] as const)("keeps history's newest version correct when a merge retains the %s side", async (kept) => {
    const f = await createRefFixture();
    const initial = await seed(f, f.reference("personal/document"), "base\n");
    const git = makeGitExec(f.root), ref = "refs/arc/user/test-user/personal";
    const base = (await git("git", ["rev-parse", ref])).stdout;
    success(await f.store.write({ ...update(f, initial, "local\n"), provenance: { ...testProvenance, verb: "local-write", lifecycleAction: "local" } }));
    const local = (await git("git", ["rev-parse", ref])).stdout;
    const from = await f.settle();
    await git("git", ["update-ref", ref, base]);
    success(await f.store.write({ ...update(f, initial, "remote\n"), provenance: { ...testProvenance, verb: "remote-write", lifecycleAction: "remote" } }));
    const remote = (await git("git", ["rev-parse", ref])).stdout;
    const source = kept === "remote" ? remote : local;
    const metadataPath = "test-user/metadata-test-user.json";
    await plantRef(f.root, ref, [{ path: metadataPath, content: (await git("git", ["show", `${source}:${metadataPath}`])).stdout },
      { path: `test-user/${initial.reference.key}`, content: `${kept}\n` }], { parents: [local, remote],
      message: renderStoreCommitMessage({ ...testProvenance, verb: "merge", lifecycleAction: "merged" }, initial.reference, randomUUID()) });
    const history = success(await f.store.history({ reference: initial.reference }));
    expect(history.map(({ content }) => content)).toEqual(kept === "remote" ? ["remote\n", "local\n", "base\n"] : ["local\n", "remote\n", "local\n", "base\n"]);
    expect(history[0]?.provenance).toMatchObject({ lifecycleAction: kept === "remote" ? "remote" : "merged" });
    expect(history[0]?.version).toBe(success(await f.store.read({ reference: initial.reference })).version);
    const changes = success(await f.store.changes({ from, to: await f.settle(), references: [initial.reference] }));
    expect(changes.map(({ content }) => content)).toEqual(kept === "remote" ? ["remote\n"] : ["remote\n", "local\n"]);
    expect(changes.map(({ provenance }) => "lifecycleAction" in provenance ? provenance.lifecycleAction : "legacy"))
      .toEqual(kept === "remote" ? ["remote"] : ["remote", "merged"]);
  });
});
