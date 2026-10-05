/** Git-free checkout reads through the public composition point. */
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStore } from "../../../../src/lib/store/create.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { digestBytes } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { testStorePorts } from "../../../helpers/store/in-repo-ports.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const noGit = async (): Promise<never> => { throw new Error("Git is unavailable in this directory"); };
const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));

describe("repository store flat reads", () => {
  it("constructs without consulting an I/O port", () => {
    const ports = testStorePorts("/unavailable", noGit, noGit);
    ports.clock = () => { throw new Error("The clock must remain unused during construction"); };
    const store = createStore(ports);
    expect(store.capabilities).toEqual({ stateOffBranch: false });
  });
  it("reads exact flat-active bytes and digest without Git or identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-store-flat-")); roots.push(root);
    await mkdir(join(root, ".arc/active"), { recursive: true });
    const content = makeMetaFixture("example");
    await writeFile(join(root, ".arc/active/meta-example.md"), content);
    const result = await createStore(testStorePorts(root, noGit, noGit)).read({ reference });
    expect(result).toMatchObject({ status: "ok", result: {
      reference, content, version: digestBytes(Buffer.from(content)), formatVersion: 1,
      placement: { kind: "active" }, conflicts: [], fields: { state: "Active" },
    } });
    if (result.status === "ok") expect(result.result.links).toBeUndefined();
  });
  it("retains a malformed flat meta as raw bytes and a held-here diagnostic, skipping symlinks and nested active files", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-store-held-")); roots.push(root);
    await mkdir(join(root, ".arc/active/nested"), { recursive: true });
    const content = "# Bad meta\n\n| State | Owner | Branch | Class | Priority |\n|---|---|---|---|---|\n| `Active` | `andrew` |\n";
    await writeFile(join(root, ".arc/active/meta-example.md"), content);
    await writeFile(join(root, ".arc/active/nested/meta-nested.md"), makeMetaFixture("nested"));
    await symlink("meta-example.md", join(root, ".arc/active/meta-link.md"));
    const store = createStore(testStorePorts(root, noGit, noGit));
    expect(await store.read({ reference })).toMatchObject({ status: "ok", result: { content, placement: { kind: "active" } } });
    const listed = await store.list({ family: "work-item", kind: "work-item/meta", filter: { heldHere: true, locations: ["active"] } });
    expect(listed).toMatchObject({ status: "ok", result: { status: "complete", records: [], missed: true,
      diagnostics: [{ kind: "malformed", key: ".arc/active/meta-example.md" }] } });
    if (listed.status === "ok" && listed.result.status === "complete") {
      expect(listed.result.diagnostics).toHaveLength(1);
      expect(listed.result.asOf).toBeUndefined();
    }
  });
});
