import { createExecaRawGitExec } from "../../src/lib/git/process-executor.js";

import { afterEach, describe, expect, it } from "vitest";

import { createRefTestRepository, plantRef, removeLooseObject, plantMissingRef } from "../helpers/store/ref-plant.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  const results = await Promise.allSettled(cleanups.splice(0).map((cleanup) => cleanup()));
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
});

describe.each(["files", "reftable"] as const)("raw state planting (%s)", (format) => {
  it("plants nested records, metadata bytes, and gitlinks on a ref beside a push-designated code remote", async () => {
    const repo = await createRefTestRepository(format);
    cleanups.push(repo.cleanup);
    const codeTip = (await repo.exec("git", ["rev-parse", "HEAD"])).stdout;
    const ref = "refs/arc/work/planted";
    const planted = await plantRef(repo.root, ref, [
      { path: "metadata.json", content: '{"version":1}\n' },
      { path: "1_alpha/spec-alpha.md", content: "# Alpha\n" },
      { path: "review/candidate.json", content: "{}\n" },
      { path: "code-link", mode: "160000", oid: codeTip },
    ]);
    const formatFound = (await repo.exec("git", ["rev-parse", "--show-ref-format"])).stdout;
    const designation = await repo.exec("git", ["config", "--get", "remote.origin.arc-state"]).catch(() => ({ stdout: "absent" }));
    const entries = await repo.exec("git", ["ls-tree", "-r", planted.tip]);
    expect({ formatFound, designation: designation.stdout, entries: entries.stdout }).toMatchObject({
      formatFound: format, designation: "push", entries: expect.stringContaining(`160000 commit ${codeTip}\tcode-link`),
    });
    expect((await repo.exec("git", ["show", `${ref}:metadata.json`])).stdout).toBe('{"version":1}');
    expect((await repo.exec("git", ["show", `${ref}:1_alpha/spec-alpha.md`])).stdout).toBe("# Alpha");
    expect((await repo.exec("git", ["show", `${ref}:review/candidate.json`])).stdout).toBe("{}");
  });

  it("keeps the planted ref while removing its loose tip, tree, and blob objects", async () => {
    const repo = await createRefTestRepository(format);
    cleanups.push(repo.cleanup);
    const ref = "refs/arc/work/missing-objects";
    const planted = await plantRef(repo.root, ref, [{ path: "note.md", content: "# Missing\n" }]);
    const blob = planted.blobs.get("note.md");
    if (!blob) throw new Error("No planted blob");
    const oids = [blob, planted.tree, planted.tip];
    await Promise.all(oids.map((oid) => removeLooseObject(repo.root, oid)));
    const present = await Promise.all(oids.map((oid) => repo.exec("git", ["cat-file", "-e", oid]).then(() => true, () => false)));
    expect(present).toEqual([false, false, false]);
    expect((await repo.exec("git", ["rev-parse", ref])).stdout).toBe(planted.tip);
  });


  it("plants a never-existing tip directly only in files-format ref storage", async () => {
    const repo = await createRefTestRepository(format);
    cleanups.push(repo.cleanup);
    const ref = "refs/arc/work/never-existed";
    const missing = "a".repeat(40);
    if (format === "reftable") {
      await expect(plantMissingRef(repo.root, ref, missing)).rejects.toThrow(/real tip.*removeLooseObject/u);
    } else {
      await plantMissingRef(repo.root, ref, missing);
      expect((await repo.exec("git", ["rev-parse", ref])).stdout).toBe(missing);
      await expect(repo.exec("git", ["cat-file", "-e", missing])).rejects.toMatchObject({ kind: "nonzero-exit" });
    }
  });


  it("preserves binary blob bytes and quoted or newline-bearing filenames", async () => {
    const repo = await createRefTestRepository(format);
    cleanups.push(repo.cleanup);
    const ref = "refs/arc/work/binary";
    const path = 'nested/odd "name\n.svg';
    const bytes = new Uint8Array([0, 255, 10]);
    await plantRef(repo.root, ref, [{ path, content: bytes }]);
    const result = await createExecaRawGitExec(repo.root)(["show", `${ref}:${path}`]);
    expect(Array.from(result.stdout)).toEqual(Array.from(bytes));
  });


  it("plants an explicit merge history and message without moving the code branch", async () => {
    const repo = await createRefTestRepository(format);
    cleanups.push(repo.cleanup);
    const ref = "refs/arc/work/history";
    const code = (await repo.exec("git", ["rev-parse", "HEAD"])).stdout;
    const first = await plantRef(repo.root, ref, [{ path: "note.md", content: "first" }]);
    const merged = await plantRef(repo.root, ref, [{ path: "note.md", content: "merged" }], {
      parents: [first.tip, code], message: "Merge planted records",
    });
    const parents = (await repo.exec("git", ["rev-list", "-1", "--parents", merged.tip])).stdout;
    const message = (await repo.exec("git", ["show", "--no-patch", "--format=%B", merged.tip])).stdout;
    const head = (await repo.exec("git", ["rev-parse", "HEAD"])).stdout;
    expect({ parents, message, head }).toEqual({
      parents: `${merged.tip} ${first.tip} ${code}`, message: "Merge planted records", head: code,
    });
  });

});
