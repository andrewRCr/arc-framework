/** UID-less tracked storage refuses identities it cannot establish. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { OwnerIdentitySchema, RecordReferenceSchema, StateVersionSchema } from "../../src/lib/store/identity.js";
import { KIND_REGISTRY } from "../../src/lib/store/registry.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { inRepoContent } from "../helpers/store/in-repo-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const cases = [
  ["work-item/meta", ".arc/active/meta-example.md", "work-item"],
  ["work-item/notes", ".arc/active/notes-example.md", "work-item"],
  ["work-item/companion", ".arc/active/research-example.md", "work-item"],
  ["cohort/document", ".arc/backlog/planned/example/cohort-example.md", "cohort"],
  ["project-inbox/inbox", ".arc/ATOMIC-INBOX.md", "project"],
  ["review/candidate", ".arc/system/.internal/candidates/example.json", "work-item"],
  ["lineage/transition", ".arc/system/.internal/transitions/example.json", "work-item"],
] as const;

describe("tracked generation admission", () => {
  it.each(cases)("refuses unestablished UID for %s and permits supported named identity", async (kind, path, type) => {
    const h = await trackedWriteFixture();
    const owner = OwnerIdentitySchema.parse({ type, name: "example" });
    const named = RecordReferenceSchema.parse({ kind, owner, ...(kind === "work-item/companion" ? { key: "research" } : {}) });
    const uid = RecordReferenceSchema.parse({ ...named, owner: { ...owner, uid: "11111111-1111-4111-8111-111111111111" } });
    const put = async (path: string, content: string) => {
      await mkdir(dirname(join(h.root, path)), { recursive: true });
      await writeFile(join(h.root, path), content);
    };
    await put(".arc/active/meta-example.md", makeMetaFixture("example"));
    await put(path, inRepoContent(named));
    await h.exec("git", ["add", "."]);
    await h.exec("git", ["commit", "-m", "Save named tracked identities"]);
    const asOf = StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
    const refusal = { status: "refused", refusal: { code: "unsupported", case: "rename",
      remedy: { text: expect.stringContaining("UID") } } };
    for (const query of [{}, { asOf }]) {
      expect(await h.store.read({ reference: uid, ...query })).toMatchObject(refusal);
      expect(await h.store.list({ family: KIND_REGISTRY[kind].family, kind, owner: uid.owner, ...query })).toMatchObject(refusal);
      expect(success(await h.store.read({ reference: named, ...query })).reference).toEqual(named);
      expect(success(await h.store.list({ family: KIND_REGISTRY[kind].family, kind, owner, ...query })))
        .toMatchObject({ status: "complete", records: [expect.objectContaining({ reference: named })] });
    }
    expect(await h.store.history({ reference: uid })).toMatchObject(refusal);
    expect(await h.store.changes({ from: asOf, to: asOf, references: [uid] })).toMatchObject(refusal);
    expect(success(await h.store.history({ reference: named }))).not.toHaveLength(0);
    expect(success(await h.store.changes({ from: asOf, to: asOf, references: [named] }))).toEqual([]);
  });
});
