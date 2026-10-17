import { describe, expect, it } from "vitest";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { mutationOf, seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { plantRef } from "../helpers/store/ref-plant.js";

async function plantInbox(f: RefConformanceFixture, content: string) {
  const ref = "refs/arc/user/test-user/personal";
  const git = makeGitExec(f.root);
  const tip = (await git("git", ["rev-parse", ref])).stdout;
  const metadata = (await git("git", ["show", `${ref}:test-user/metadata-test-user.json`])).stdout;
  return plantRef(f.root, ref, [
    { path: "test-user/metadata-test-user.json", content: metadata },
    { path: "test-user/USER-INBOX.md", content },
  ], { parents: [tip] });
}

const inbox = "# Inbox\n\n## Errand\n\n### [ ] One\n_Id:_ `abcdef01`\n\nOne.\n";
const duplicate = `${inbox}\n### [ ] Two\n_Id:_ \`abcdef01\`\n\nTwo.\n`;

describe("stale merge admission", () => {
  it("reports all unmergeable stale puts and removals without publishing any write", async () => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("project-registry/counter", "one"));
    const second = await seed(f, f.reference("project-registry/counter", "two"));
    const doc = await seed(f, f.reference("personal/document"), "before\n");
    const changed = [first, second];
    for (const record of changed) success(await f.store.write(update(f, record)));
    success(await f.store.write(update(f, doc, "after\n")));
    const before = await f.settle();
    expect(await f.store.batch({ writes: [...changed.map((record) => mutationOf(update(f, record))),
      { action: "remove", reference: doc.reference, expected: doc.version }], provenance: testProvenance }))
      .toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [first.reference, second.reference, doc.reference] } });
    expect(await f.settle()).toBe(before);
  });

  it.each(["stored", "base"] as const)("names duplicate IDs and the %s version, then allows repair", async (side) => {
    const f = await createRefFixture();
    const original = await seed(f, f.reference("personal/inbox"), inbox);
    await plantInbox(f, duplicate);
    const malformed = success(await f.store.read({ reference: original.reference }));
    if (side === "base") success(await f.store.write(update(f, malformed, inbox.replace("One.", "Current."))));
    const base = side === "base" ? malformed : original;
    const before = await f.settle();
    expect(await f.store.write(update(f, base, inbox.replace("One.", "Incoming."))))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", condition: expect.stringContaining(malformed.version),
        remedy: { text: expect.stringMatching(/current version.*distinct/iu) } } });
    const refusal = await f.store.write(update(f, base, inbox));
    expect(refusal).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("abcdef01") } });
    expect(await f.settle()).toBe(before);
    const current = success(await f.store.read({ reference: original.reference }));
    success(await f.store.write(update(f, current, inbox)));
    const fixed = success(await f.store.read({ reference: original.reference }));
    success(await f.store.write(update(f, fixed, inbox.replace("One.", "Repaired."))));
  });

  it("rechecks the parser on merged bytes and accepts a corrected current-version write", async () => {
    const f = await createRefFixture({ "personal/document": { parser: (content) => (content.match(/TOKEN/gu)?.length ?? 0) <= 1
      ? { success: true, data: {} } : { success: false, error: "Only one TOKEN is allowed" } } });
    const base = await seed(f, f.reference("personal/document"), "one\nmiddle\nthree\n");
    success(await f.store.write(update(f, base, "TOKEN\nmiddle\nthree\n")));
    const before = await f.settle();
    expect(await f.store.write(update(f, base, "one\nmiddle\nTOKEN\n"))).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", condition: "Only one TOKEN is allowed", remedy: { text: expect.stringMatching(/read.*current version/iu) },
    } });
    expect(await f.settle()).toBe(before);
    const current = success(await f.store.read({ reference: base.reference }));
    success(await f.store.write(update(f, current, "one\nmiddle\nTOKEN\n")));
  });

  it("rechecks serialization when individually bounded sides merge above the size cap", async () => {
    const f = await createRefFixture();
    const base = await seed(f, f.reference("personal/document"), "one\nmiddle\nthree\n");
    success(await f.store.write(update(f, base, `${"a".repeat(600_000)}\nmiddle\nthree\n`)));
    const before = await f.settle();
    expect(await f.store.write(update(f, base, `one\nmiddle\n${"b".repeat(600_000)}\n`))).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", rule: "store.size-cap", remedy: { text: expect.stringMatching(/read.*current version/iu) },
    } });
    expect(await f.settle()).toBe(before);
    const current = success(await f.store.read({ reference: base.reference }));
    success(await f.store.write(update(f, current, "corrected\n")));
  });
});
