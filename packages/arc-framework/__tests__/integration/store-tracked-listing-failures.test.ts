/** Tracked namespace failures remain visible through the public store. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStore } from "../../src/lib/store/create.js";
import { ListInputSchema } from "../../src/lib/store/read.js";
import { StateVersionSchema } from "../../src/lib/store/identity.js";
import { buildLifecycleIndex } from "../../src/lib/work-unit/lifecycle-index.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { inRepoContent } from "../helpers/store/in-repo-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { success } from "../helpers/store/suite-tools.js";

async function fixture(kind: "lineage/transition" | "review/candidate" | "review/integration-boundary" | "work-item/meta" | "work-item/companion" | "cohort/document") {
  const h = await trackedWriteFixture();
  const path = kind === "lineage/transition" ? ".arc/system/.internal/transitions/example.json"
    : kind === "review/candidate" ? ".arc/system/.internal/candidates/example.json"
    : kind === "review/integration-boundary" ? ".arc/system/.internal/candidates/example.boundary.json"
    : kind === "cohort/document" ? ".arc/backlog/planned/group/cohort-group.md"
    : kind === "work-item/meta" ? ".arc/active/meta-example.md" : ".arc/active/research-example.md";
  const put = async (target: string, content: string) => {
    await mkdir(dirname(join(h.root, target)), { recursive: true });
    await writeFile(join(h.root, target), content);
  };
  if (kind.startsWith("work-item/") || kind.startsWith("review/")) await put(".arc/active/meta-example.md", makeMetaFixture("example"));
  const reference = kind === "cohort/document" ? undefined : h.reference(kind, "example", kind === "work-item/companion" ? "research" : undefined);
  await put(path, reference === undefined ? "# Cohort\n" : inRepoContent(reference));
  await h.exec("git", ["add", "."]);
  await h.exec("git", ["commit", "-m", "Save listing records"]);
  const asOf = StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
  const input = ListInputSchema.parse({ family: kind.split("/")[0], kind, filter: { heldHere: true } });
  return { ...h, path, input, asOf, put };
}

describe("tracked listing acquisition", () => {
  it("distinguishes missing, non-directory and repaired saved namespaces", async () => {
    const h = await fixture("lineage/transition");
    const namespace = dirname(h.path);
    const save = async () => {
      await h.exec("git", ["add", "-A"]);
      await h.exec("git", ["commit", "-m", "Save namespace state"]);
      return StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
    };
    await rm(join(h.root, namespace), { recursive: true });
    await h.put(`${dirname(namespace)}/kept.json`, "ancestor remains\n");
    expect(success(await h.store.list({ ...h.input, asOf: await save() }))).toMatchObject({ status: "absent" });
    await h.put(namespace, "not a directory\n");
    await expect(h.store.list({ ...h.input, asOf: await save() })).rejects.toMatchObject({ code: "store.operation-failed" });
    await rm(join(h.root, namespace));
    await h.put(h.path, inRepoContent(h.reference("lineage/transition")));
    expect(success(await h.store.list({ ...h.input, asOf: await save() }))).toMatchObject({ status: "complete", missed: false });
  });

  it.each(["lineage/transition", "review/candidate", "review/integration-boundary", "cohort/document", "work-item/meta", "work-item/companion"] as const)("reports denied %s roots and permits retry", async (kind) => {
    const h = await fixture(kind);
    const before = success(await h.store.list(h.input));
    expect(before.status).toBe("complete");
    const root = join(h.root, kind === "cohort/document" ? ".arc/backlog/planned" : dirname(h.path));
    const actual = h.ports.fs.readdir;
    for (const code of ["EACCES", "EPERM"] as const) {
      h.ports.fs.readdir = async (path) => { if (path === root) throw Object.assign(new Error("Directory denied"), { code }); return actual(path); };
      const result = success(await h.store.list(h.input));
      expect(result).toMatchObject({ status: "unreadable", condition: expect.stringContaining(root.slice(h.root.length + 1)), remedy: { text: expect.stringContaining("Restore") } });
    }
    h.ports.fs.readdir = actual;
    expect(success(await h.store.list(h.input))).toEqual(before);
    expect(success(await h.store.list({ ...h.input, asOf: h.asOf }))).toMatchObject({ status: "complete", missed: false, asOf: h.asOf });
  });

  it.each(["lineage/transition", "cohort/document", "work-item/meta", "work-item/companion"] as const)("preserves unknown %s acquisition errors", async (kind) => {
    const h = await fixture(kind);
    const actual = h.ports.fs.readdir;
    const failure = Object.assign(new Error("Device failure"), { code: "EIO" });
    const root = join(h.root, kind === "cohort/document" ? ".arc/backlog/planned" : dirname(h.path));
    h.ports.fs.readdir = async (path) => { if (path === root) throw failure; return actual(path); };
    await expect(h.store.list(h.input)).rejects.toMatchObject({ code: "store.operation-failed", cause: failure });
    h.ports.fs.readdir = actual;
    expect(success(await h.store.list(h.input))).toMatchObject({ status: "complete", missed: false });
  });

  it.each(["cohort/document", "work-item/meta"] as const)("retains readable %s records beside a denied subtree", async (kind) => {
    const h = await fixture(kind);
    const denied = ".arc/backlog/planned/denied";
    await h.put(`${denied}/${kind === "cohort/document" ? "cohort-denied.md" : "meta-denied.md"}`, kind === "cohort/document" ? "# Denied cohort\n" : makeMetaFixture("denied", { state: "Planning" }));
    const actual = h.ports.fs.readdir;
    h.ports.fs.readdir = async (path) => { if (path === join(h.root, denied)) throw Object.assign(new Error("Denied"), { code: "EACCES" }); return actual(path); };
    const listed = success(await h.store.list(h.input));
    expect(listed).toMatchObject({ status: "complete", records: [expect.objectContaining({ content: expect.any(String) })], missed: true, diagnostics: [{ kind: "unreadable", key: denied }] });
    if (kind === "work-item/meta") {
      const activeOnly = success(await h.store.list({ ...h.input, filter: { heldHere: true, locations: ["active"] } }));
      expect(activeOnly).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
      expect((await buildLifecycleIndex({ cwd: h.root, fs: h.ports.fs })).has("denied")).toBe(false);
    }
    h.ports.fs.readdir = actual;
    expect(success(await h.store.list(h.input))).toMatchObject({ status: "complete", records: [expect.any(Object), expect.any(Object)], missed: false, diagnostics: [] });
  });

  it.each(["lineage/transition", "review/candidate", "cohort/document", "work-item/meta", "work-item/companion"] as const)("preserves saved-tree %s acquisition failures", async (kind) => {
    const h = await fixture(kind);
    const actual = h.ports.exec;
    const failure = makeGitProcessError({ command: "git", args: ["ls-tree"], exitCode: 128, stderr: "fatal: object failure" });
    h.ports.exec = async (command, args, options) => { if (args[0] === "ls-tree") throw failure; return actual(command, args, options); };
    await expect(h.store.list({ ...h.input, asOf: h.asOf })).rejects.toBe(failure);
    h.ports.exec = actual;
    expect(success(await createStore(h.ports).list({ ...h.input, asOf: h.asOf }))).toMatchObject({ status: "complete", missed: false });
  });

  it("reports a denied companion directory after acquiring its meta", async () => {
    const h = await fixture("work-item/companion");
    const actual = h.ports.fs.readdir;
    let activeReads = 0;
    h.ports.fs.readdir = async (path) => {
      if (path === join(h.root, ".arc/active") && ++activeReads > 1) throw Object.assign(new Error("Access lost"), { code: "EACCES" });
      return actual(path);
    };
    expect(success(await h.store.list(h.input))).toMatchObject({ status: "unreadable", condition: expect.stringContaining(".arc/active") });
    h.ports.fs.readdir = actual;
    expect(success(await h.store.list(h.input))).toMatchObject({ status: "complete", missed: false });
  });

  it("preserves a meta content device failure instead of labelling it malformed", async () => {
    const h = await fixture("work-item/meta");
    const actual = h.ports.fs.readFile;
    const failure = Object.assign(new Error("Read failed"), { code: "EIO" });
    h.ports.fs.readFile = async (path) => { if (path === join(h.root, h.path)) throw failure; return actual(path); };
    await expect(h.store.list(h.input)).rejects.toMatchObject({ code: "store.operation-failed", cause: failure });
    h.ports.fs.readFile = actual;
    expect(success(await h.store.list(h.input))).toMatchObject({ status: "complete", missed: false });
  });
});
