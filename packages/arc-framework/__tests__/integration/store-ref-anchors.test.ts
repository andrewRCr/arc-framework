import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { success, testProvenance, update } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { StateVersionSchema } from "../../src/lib/store/index.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { META_REGISTRATION } from "../../src/lib/store/kinds/meta/registration.js";

const meta = { parser: META_REGISTRATION.parser, anchorFields: META_REGISTRATION.anchorFields };

describe("traveling ref anchors", () => {
  it("carries the anchor's manifest in the record commit and through a ref-only fetch", async () => {
    const f = await createRefFixture({ "work-item/meta": { ...meta, check: async ({ after }) => {
      expect(success(await after.list({ family: "work-item" }))).toMatchObject({ status: "complete", missed: false });
      return [];
    } } });
    const git = makeGitExec(f.root);
    const reference = f.reference("work-item/meta");
    const created = success(await f.store.write({ action: "put", reference, expected: null,
      content: makeMetaFixture(reference.owner.name), placement: { kind: "active" }, provenance: testProvenance }));
    const record = success(await f.store.read({ reference: created.reference }));
    const uid = "uid" in record.reference.owner ? record.reference.owner.uid : undefined;
    const ref = `refs/arc/work/${uid}`;
    expect((await git("git", ["ls-tree", "--name-only", ref])).stdout).not.toContain(`state-${uid}`);
    const token = success(await f.store.version());
    const content = makeMetaFixture(reference.owner.name, { stateAtHandoff: token });
    success(await f.store.write(update(f, record, content)));
    expect((await git("git", ["rev-parse", `${ref}:state-${uid}`])).stdout.trim()).toBe(token);
    expect((await git("git", ["show", `${ref}:meta-${reference.owner.name}.md`])).stdout.trimEnd()).toBe(content.trimEnd());
    const other = await createRefFixture();
    const otherGit = makeGitExec(other.root);
    await otherGit("git", ["fetch", "--no-tags", f.root, `${ref}:${ref}`]);
    expect((await otherGit("git", ["cat-file", "-t", token])).stdout.trim()).toBe("tree");
    expect((await otherGit("git", ["rev-parse", `${ref}:state-${uid}`])).stdout.trim()).toBe(token);
  });
  it.each(["missing", "blob", "commit"] as const)("refuses a %s anchor atomically and accepts a corrected token", async (kind) => {
    const f = await createRefFixture({ "work-item/meta": meta });
    const git = makeGitExec(f.root);
    const token = StateVersionSchema.parse(kind === "missing" ? "0".repeat(40)
      : kind === "blob" ? (await f.ports.execInput(["hash-object", "-w", "--stdin"], "not a manifest\n", { cwd: f.root })).trim()
        : (await git("git", ["rev-parse", "HEAD"])).stdout.trim());
    const reference = f.reference("work-item/meta");
    const personal = f.reference("personal/document");
    const before = success(await f.store.version());
    const write = { action: "put" as const, reference, expected: null, placement: { kind: "active" as const },
      content: makeMetaFixture(reference.owner.name, { stateAtHandoff: token }) };
    expect(await f.store.batch({ writes: [
      { action: "put", reference: personal, expected: null, content: "retained only on success\n" }, write,
    ], provenance: testProvenance })).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable",
      field: "stateAtHandoff", stateVersion: token, historyRefs: [], remedy: { text: expect.stringContaining("version()") } } });
    expect(success(await f.store.version())).toBe(before);
    expect(await f.store.read({ reference: personal })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const accepted = success(await f.store.write({ ...write, content: makeMetaFixture(reference.owner.name, { stateAtHandoff: before }), provenance: testProvenance }));
    expect(success(await f.store.read({ reference: accepted.reference })).fields).toMatchObject({ stateAtHandoff: before });
  });
  it("replaces changed anchors, preserves unchanged anchors, and clears a null anchor", async () => {
    const f = await createRefFixture({ "work-item/meta": meta });
    const git = makeGitExec(f.root);
    const reference = f.reference("work-item/meta");
    const first = success(await f.store.version());
    const created = success(await f.store.write({ action: "put", reference, expected: null, placement: { kind: "active" },
      content: makeMetaFixture(reference.owner.name, { stateAtHandoff: first }), provenance: testProvenance }));
    let record = success(await f.store.read({ reference: created.reference }));
    const uid = "uid" in record.reference.owner ? record.reference.owner.uid : undefined;
    const ref = `refs/arc/work/${uid}`;
    const path = `state-${uid}`;
    expect((await git("git", ["rev-parse", `${ref}:${path}`])).stdout.trim()).toBe(first);
    success(await f.store.write(update(f, record, record.content + "\nContext without changing the empty anchor.\n")));
    record = success(await f.store.read({ reference: record.reference }));
    expect((await git("git", ["rev-parse", `${ref}:${path}`])).stdout.trim()).toBe(first);
    const second = success(await f.store.version());
    success(await f.store.write(update(f, record, makeMetaFixture(reference.owner.name, { stateAtHandoff: second }))));
    record = success(await f.store.read({ reference: record.reference }));
    expect((await git("git", ["rev-parse", `${ref}:${path}`])).stdout.trim()).toBe(second);
    success(await f.store.write(update(f, record, makeMetaFixture(reference.owner.name, { stateAtHandoff: second }) + "\nNew context.\n")));
    record = success(await f.store.read({ reference: record.reference }));
    expect((await git("git", ["rev-parse", `${ref}:${path}`])).stdout.trim()).toBe(second);
    const third = success(await f.store.version());
    success(await f.store.write(update(f, record, makeMetaFixture(reference.owner.name, { stateAtHandoff: third }))));
    record = success(await f.store.read({ reference: record.reference }));
    expect((await git("git", ["rev-parse", `${ref}:${path}`])).stdout.trim()).toBe(third);
    success(await f.store.write(update(f, record, makeMetaFixture(reference.owner.name, { stateAtHandoff: null }))));
    expect((await git("git", ["ls-tree", "--name-only", ref])).stdout).not.toContain(path);
    expect(success(await f.store.list({ family: "work-item" }))).toMatchObject({ status: "complete", missed: false });
    expect((await git("git", ["cat-file", "-t", second])).stdout.trim()).toBe("tree");
  });

  it("refuses a manifest with a missing subtree and accepts it after restoration", async () => {
    const f = await createRefFixture({ "work-item/meta": meta });
    const git = makeGitExec(f.root);
    success(await f.store.write({ action: "put", reference: f.reference("personal/document"), expected: null, content: "Seed\n", provenance: testProvenance }));
    const token = success(await f.store.version());
    const subtree = (await git("git", ["rev-parse", `${token}:user`])).stdout.trim();
    const original = (await f.ports.rawExec(["cat-file", "tree", subtree], { cwd: f.root, objectAccess: "local-only" })).stdout;
    await removeLooseObject(f.root, subtree);
    const reference = f.reference("work-item/meta");
    const write = { action: "put" as const, reference, expected: null, placement: { kind: "active" as const },
      content: makeMetaFixture(reference.owner.name, { stateAtHandoff: token }), provenance: testProvenance };
    expect(await f.store.write(write)).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", field: "stateAtHandoff", stateVersion: token } });
    expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    await f.ports.rawExec(["hash-object", "-t", "tree", "-w", "--stdin"], { cwd: f.root, objectAccess: "local-only", input: original });
    const accepted = success(await f.store.write(write));
    expect(success(await f.store.read({ reference: accepted.reference })).fields).toMatchObject({ stateAtHandoff: token });
  });

});
