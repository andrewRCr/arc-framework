/** Store notes outcomes grounded in actual producer saves and real clone histories. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncFixture, syncNotesRef, syncErrandRef, seedAheadErrand } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeCommit, makeNotesTreeCommit } from "../helpers/integration.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";

describe("Store notes publication", () => {
  it("reports no identity with a configured remote, preserves notes and refs, and recovers after configuration", async () => {
    const h = await syncFixture();
    await h.a.inbox();
    await h.a.exec("git", ["config", "--unset", "arc.identity"]);
    await h.a.exec("git", ["config", "user.name", ""]);
    const before = (await h.remote("git", ["show-ref"])).stdout;
    expect(success(await h.a.store.sync())).toEqual({ states: [{ status: "no-identity", families: ["personal", "work-item", "claims"], remedy: { text: expect.stringContaining("arc.identity") } }], publishes: [] });
    expect((await h.remote("git", ["show-ref"])).stdout).toBe(before);
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", syncNotesRef, syncErrandRef])).stdout).toBe("");
    await h.a.exec("git", ["config", "arc.identity", "andrew"]);
    await h.a.exec("git", ["config", "user.name", "Clone A"]);
    expect(success(await h.a.store.sync()).publishes[0]).toEqual({ status: "pushed", families: ["personal"] });
  });

  it("maps an already published captured notes tip to noop", async () => {
    const h = await syncFixture();
    await h.a.inbox();
    expect(success(await h.a.store.sync()).publishes[0]).toEqual({ status: "pushed", families: ["personal"] });
    const base = h.a.ports.exec;
    let published = false;
    h.a.ports.exec = async (command, args, options) => {
      if (!published && args[0] === "ls-remote" && args.includes(syncNotesRef)) {
        await h.a.exec("git", ["push", "origin", syncNotesRef]); published = true;
      }
      return base(command, args, options);
    };
    expect(success(await h.a.store.sync()).publishes[0]).toEqual({ status: "noop", families: ["personal"] });
    expect(published).toBe(true);
  });

  it("maps a notes ref removed after the verified save to no-local-notes noop", async () => {
    const h = await syncFixture();
    await h.a.inbox();
    const base = h.a.ports.exec;
    let removed = false;
    h.a.ports.exec = async (command, args, options) => {
      if (!removed && args[0] === "rev-parse" && args.includes("--quiet") && args.includes(syncNotesRef)) {
        await h.a.exec("git", ["update-ref", "-d", syncNotesRef]); removed = true;
      }
      return base(command, args, options);
    };
    expect(success(await h.a.store.sync()).publishes[0]).toEqual({ status: "noop", families: ["personal"] });
    expect(removed).toBe(true);
  });

  it("reconciles two clones' notes on their own published commits, preserving both files", async () => {
    const h = await syncFixture();
    const aCommit = await makeCommit(h.cloneA, "Clone A notes");
    await h.a.exec("git", ["push", "origin", "HEAD:refs/heads/notes-a"]);
    const bCommit = await makeCommit(h.cloneB, "Clone B notes");
    await h.b.exec("git", ["push", "origin", "HEAD:refs/heads/notes-b"]);
    await h.a.exec("git", ["fetch", "origin"]);
    await h.b.exec("git", ["fetch", "origin"]);
    await h.a.inbox("Clone A exact bytes\n");
    await h.b.inbox("Clone B exact bytes\n\n");
    expect(success(await h.a.store.sync()).publishes[0]).toEqual({ status: "pushed", families: ["personal"] });
    expect(success(await h.b.store.sync()).publishes[0]).toEqual({ status: "reconciled", families: ["personal"] });
    for (const [commit, content] of [[aCommit, "Clone A exact bytes\n"], [bCommit, "Clone B exact bytes\n\n"]] as const) {
      expect(JSON.parse((await h.remote("git", ["notes", "--ref", syncNotesRef, "show", commit])).stdout)).toMatchObject({ files: { "USER-INBOX.md": content } });
    }
  });

  it("keeps same-commit contested manifests as conflict with both original snapshots intact", async () => {
    const h = await syncFixture();
    await h.a.inbox("Clone A bytes\n");
    await h.b.inbox("Clone B bytes\n");
    success(await h.a.store.sync());
    const before = (await h.remote("git", ["rev-parse", syncNotesRef])).stdout;
    expect(success(await h.b.store.sync()).publishes[0]).toMatchObject({ status: "conflict", families: ["personal"], condition: expect.stringContaining("same file"), remedy: { text: expect.any(String) } });
    expect((await h.remote("git", ["rev-parse", syncNotesRef])).stdout).toBe(before);
    const head = (await h.b.exec("git", ["rev-parse", "HEAD"])).stdout;
    expect(JSON.parse((await h.b.exec("git", ["notes", "--ref", syncNotesRef, "show", head])).stdout).files["USER-INBOX.md"]).toBe("Clone B bytes\n");
  });

  it("refuses unpublished notes while independently pushing the locally ahead Errand ref", async () => {
    const h = await syncFixture();
    const remoteBefore = await seedAheadErrand(h);
    const mainBefore = (await h.remote("git", ["rev-parse", "main"])).stdout;
    await makeCommit(h.cloneA, "Unpublished local commit");
    await h.a.inbox();
    const publishes = success(await h.a.store.sync()).publishes;
    expect(publishes[0]).toMatchObject({ status: "unpublished-history", families: ["personal"], condition: expect.stringContaining("unpublished"), remedy: { text: expect.any(String) } });
    expect(publishes[1]).toEqual({ status: "pushed", families: ["work-item", "claims"] });
    expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).not.toBe(remoteBefore);
    expect((await h.remote("git", ["rev-parse", "main"])).stdout).toBe(mainBefore);
  });

  it("reports a real notes pushability block and still completes the independent identity publish", async () => {
    const h = await syncFixture();
    await h.a.inbox();
    await mkdir(join(h.cloneA, ".git/rebase-merge"));
    expect(success(await h.a.store.sync()).publishes).toEqual([
      { status: "blocked", families: ["personal"], condition: expect.stringContaining("Rebase in progress"), remedy: { text: expect.any(String) } },
      { status: "noop", families: ["work-item", "claims"] },
    ]);
  });

  it("maps incompatible remote compaction lineage to the notes refusal", async () => {
    const h = await syncFixture();
    const head = (await h.a.exec("git", ["rev-parse", "HEAD"])).stdout;
    const remote = await makeNotesTreeCommit(h.cloneA, [{ commit: head, content: JSON.stringify({ version: 2, files: { "USER-INBOX.md": "remote bytes" } }) }],
      { manifest: { version: 1, generation: 1, preCompactionTip: null, pruned: [] } });
    await h.a.exec("git", ["push", "origin", `${remote.tip}:${syncNotesRef}`]);
    await h.a.inbox();
    expect(success(await h.a.store.sync()).publishes[0]).toMatchObject({ status: "compaction-lineage", families: ["personal"], condition: expect.stringContaining("compaction boundary"), remedy: { text: expect.any(String) } });
  });

  it("preserves a notes proof-unavailable refusal produced at the Git object boundary", async () => {
    const h = await syncFixture();
    await h.a.inbox();
    const base = h.a.ports.execInput;
    h.a.ports.execInput = async (args, content, options) => {
      if (args[0] === "cat-file" && args.some((arg) => arg.startsWith("--batch"))) throw new GitProcessError({ kind: "nonzero-exit", command: "git", args, exitCode: 128, stderr: "object proof unavailable" });
      return base(args, content, options);
    };
    expect(success(await h.a.store.sync()).publishes[0]).toMatchObject({ status: "proof-unavailable", families: ["personal"], condition: expect.stringContaining("proof is unavailable"), remedy: { text: expect.any(String) } });
  });

  it("retains a history-diverged refusal if origin advances again after the locked merge", async () => {
    const h = await syncFixture();
    await h.b.inbox("Remote original\n");
    success(await h.b.store.sync());
    const head = await makeCommit(h.cloneA, "Local published note");
    await h.a.exec("git", ["push", "origin", "HEAD:refs/heads/notes-a"]);
    await h.a.inbox("Local original\n");
    const raced = await makeNotesTreeCommit(h.cloneA, [{ commit: head, content: JSON.stringify({ version: 2, files: { "USER-INBOX.md": "Raced remote\n" } }) }]);
    const base = h.a.ports.exec;
    let moved = false;
    h.a.ports.exec = async (command, args, options) => {
      const result = await base(command, args, options);
      if (!moved && args[0] === "notes" && args.includes("merge") && args.includes("cat_sort_uniq")) {
        moved = true;
        await h.a.exec("git", ["push", "--force", "origin", `${raced.tip}:${syncNotesRef}`]);
      }
      return result;
    };
    expect(success(await h.a.store.sync()).publishes[0]).toMatchObject({ status: "history-diverged", families: ["personal"], condition: expect.stringContaining("histories diverged"), remedy: { text: expect.any(String) } });
    expect(moved).toBe(true);
    expect((await h.remote("git", ["rev-parse", syncNotesRef])).stdout).toBe(raced.tip);
  });
});
