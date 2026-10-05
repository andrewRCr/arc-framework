/** Real notes and transient publication through the public storage contract. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { addBareRemote, makeGitExec } from "../helpers/integration.js";

describe("repository store sync", () => {
  it("reports absent identity and origin independently without changing a note or ref", async () => {
    const h = await trackedWriteFixture();
    await h.exec("git", ["commit", "--allow-empty", "-m", "Initialize"]);
    const before = (await h.exec("git", ["show-ref", "--head"])).stdout;
    expect(success(await h.store.sync())).toEqual({ states: [
      { status: "no-remote" },
      { status: "no-identity", families: ["personal", "work-item", "claims"], remedy: { text: expect.stringContaining("arc.identity") } },
    ], publishes: [] });
    expect((await h.exec("git", ["show-ref", "--head"])).stdout).toBe(before);
    h.ports.identity = async () => SlugSchema.parse("andrew");
    expect(success(await h.store.sync())).toEqual({ states: [{ status: "no-remote" }], publishes: [] });
  });

  it("finds no eligible local notes and still completes the independent identity publish", async () => {
    const h = await trackedWriteFixture();
    await h.exec("git", ["commit", "--allow-empty", "-m", "Initialize"]);
    await addBareRemote(h.root);
    h.ports.identity = async () => SlugSchema.parse("andrew");
    h.ports.remote = async () => "origin";
    expect(success(await h.store.sync())).toEqual({ states: [], publishes: [
      { status: "noop", families: ["personal"] },
      { status: "noop", families: ["work-item", "claims"] },
    ] });
  });

  it("publishes exact personal bytes to the remote notes after a contract write", async () => {
    const h = await trackedWriteFixture();
    await h.exec("git", ["commit", "--allow-empty", "-m", "Initialize"]);
    const origin = await addBareRemote(h.root);
    await h.exec("git", ["push", "origin", "main"]);
    h.ports.identity = async () => SlugSchema.parse("andrew");
    h.ports.remote = async () => "origin";
    const reference = RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: "andrew" } });
    const content = "# User Inbox\n\nA retained personal note.\n";
    success(await h.store.write({ action: "put", reference, content, expected: null, provenance: { verb: "save", lifecycleAction: "save" } }));
    const result = success(await h.store.sync());
    expect(result.publishes).toEqual([
      { status: "pushed", families: ["personal"] },
      { status: "noop", families: ["work-item", "claims"] },
    ]);
    const head = (await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
    const note = (await makeGitExec(origin)("git", ["notes", "--ref", "arc/user/andrew", "show", head])).stdout;
    expect(JSON.parse(note)).toMatchObject({ files: { "USER-INBOX.md": content } });
    expect(await readFile(join(h.root, ".arc/user/andrew/USER-INBOX.md"), "utf8")).toBe(content);
  });
});
