/** Store-backed scaffolds create records without branch metadata or session-note files. */
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { scaffoldIntoWorktree } from "../../../src/lib/git/worktree-scaffold.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";

describe("store scaffold", () => {
  it("writes only its active operational record without Branch or SESSION-NOTES", async () => {
    const h = createLifecycleHarness();
    const io = { ...createUserIOContext(), exec: async () => { throw Error("no Git notes"); }, writeFile: async () => { throw Error("no checkout files"); }, mkdir: async () => { throw Error("no directories"); } };
    await scaffoldIntoWorktree({ io, store: h.store, internalTemplateDir: "/templates" }, { worktreePath: "/checkout", branch: "person", wuName: "demo", spawningIdentity: "starter", createdByArc: false });
    const lookup = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("demo") }));
    const read = lifecycleSuccess(await h.store.read({ reference: lookup.reference }));
    expect(read.placement).toEqual({ kind: "active" });
    expect(parseMetaRecord(read.content)).toMatchObject({ state: "Planning", owner: "starter", currentWorkflow: "draft-design", branch: null });
    expect(read.content).not.toContain("person");
  });
  it("surfaces refused creation with its repair and writes no files", async () => {
    const h = createLifecycleHarness();
    await h.seedMeta("demo");
    const io = { ...createUserIOContext(), exec: async () => { throw Error("no Git notes"); }, writeFile: async () => { throw Error("no files"); }, mkdir: async () => { throw Error("no directories"); } };
    await expect(scaffoldIntoWorktree({ io, store: h.store, internalTemplateDir: "/templates" }, { worktreePath: "/checkout", branch: null, wuName: "demo", spawningIdentity: "starter", createdByArc: false })).rejects.toThrow();
    const lookup = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("demo") }));
    expect(parseMetaRecord(lifecycleSuccess(await h.store.read({ reference: lookup.reference })).content).owner).toBe("test-user");
  });
});
