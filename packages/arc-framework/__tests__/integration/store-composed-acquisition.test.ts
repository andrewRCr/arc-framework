/** Failed foreign lifecycle acquisition stays visible without granting absence or creation. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { StateVersionSchema } from "../../src/lib/store/identity.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

async function fixture(neighbor: boolean) {
  const h = await trackedWriteFixture();
  const put = async (path: string, content: string) => {
    await mkdir(dirname(join(h.root, path)), { recursive: true }); await writeFile(join(h.root, path), content);
  };
  const save = async (message: string) => { await h.exec("git", ["add", "."]); await h.exec("git", ["commit", "-m", message]); };
  await h.exec("git", ["commit", "--allow-empty", "-m", "empty base"]);
  await h.exec("git", ["checkout", "-b", "feat/foreign"]);
  const content = makeMetaFixture("foreign", { branch: "feat/foreign" });
  await put(".arc/active/meta-foreign.md", content);
  await put(".arc/active/notes-foreign.md", "foreign notes\n");
  await put(".arc/active/research-foreign.md", "foreign research\n");
  await save("foreign records"); await h.exec("git", ["checkout", "main"]);
  if (neighbor) {
    await put(".arc/active/meta-neighbor.md", makeMetaFixture("neighbor", { branch: "main" }));
    await put(".arc/active/notes-neighbor.md", "neighbor notes\n");
    await put(".arc/active/research-neighbor.md", "neighbor research\n");
    await save("readable neighbor");
  }
  const head = StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
  return { ...h, content, put, head };
}

for (const neighbor of [false, true]) {
  it.each(["malformed", "read", "enumeration"] as const)(`retains %s acquisition evidence with readable neighbor ${neighbor} and repairs`, async (fault) => {
    const h = await fixture(neighbor);
    const kinds = ["work-item/meta", "work-item/notes", "work-item/companion"] as const;
    const saved = await Promise.all(kinds.map((kind) => h.store.list({ family: "work-item", kind, asOf: h.head })));
    const healthy = await Promise.all(kinds.map((kind) => h.store.list({ family: "work-item", kind })));
    const actual = h.ports.exec;
    h.ports.exec = async (command, args, options) => {
      const metaRead = args[0] === "show" && args.some((arg) => arg.includes(":.arc/active/meta-foreign.md"));
      const enumeration = args[0] === "ls-tree" && args.includes("--full-tree") && args.some((arg) => arg.includes("feat/foreign"));
      if (fault === "malformed" && metaRead) return { stdout: "# Invalid foreign meta\n" };
      if ((fault === "read" && metaRead) || (fault === "enumeration" && enumeration)) {
        throw new GitProcessError({ kind: "nonzero-exit", command, args, exitCode: 128, stderr: "Object acquisition failed" });
      }
      return actual(command, args, options);
    };
    for (const kind of kinds) {
      const result = success(await h.store.list({ family: "work-item", kind }));
      expect(["complete", "unreadable"]).toContain(result.status);
      if (result.status === "complete") {
        expect(result.missed).toBe(true); expect(result.diagnostics.length).toBeGreaterThan(0);
        expect(result.records.every((record) => record.reference.owner.name === "neighbor")).toBe(true);
        if (neighbor) expect(result.records.length).toBeGreaterThan(0);
      } else expect(neighbor).toBe(false);
      const filtered = success(await h.store.list({ family: "work-item", kind, filter: { locations: ["planned"] } }));
      expect(filtered.status === "unreadable" || (filtered.status === "complete" && filtered.missed)).toBe(true);
    }
    expect(await Promise.all(kinds.map((kind) => h.store.list({ family: "work-item", kind, asOf: h.head })))).toEqual(saved);
    const target = h.reference("work-item/meta", "foreign");
    for (const operation of [() => h.store.read({ reference: target }),
      () => h.store.lookup({ kind: "slug", slug: SlugSchema.parse("foreign") }),
      () => h.store.write({ action: "put", reference: target, expected: null, content: h.content,
        placement: { kind: "active" }, provenance: { verb: "create", lifecycleAction: "create" } })]) {
      if (fault === "malformed") await expect(operation()).resolves.toMatchObject({ status: "refused", refusal: {
        code: "record-malformed", rule: "composition", remedy: { text: expect.stringContaining("retry") } } });
      else await expect(operation()).rejects.toMatchObject({ code: "store.lifecycle-incomplete" });
    }
    await expect(readFile(join(h.root, ".arc/active/meta-foreign.md"))).rejects.toMatchObject({ code: "ENOENT" });
    if (neighbor) expect(success(await h.store.read({ reference: h.reference("work-item/meta", "neighbor") })).content).toContain("neighbor");
    h.ports.exec = actual;
    expect(await Promise.all(kinds.map((kind) => h.store.list({ family: "work-item", kind })))).toEqual(healthy);
    expect(success(await h.store.read({ reference: target })).content).toBe(h.content);
    expect(success(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("foreign") })).reference).toEqual(target);
  });
}

it.each(["unknown", "canceled", "output-limit", "timed-out", "signaled"] as const)("retains original %s composition cause instead of degrading it to absence", async (kind) => {
  const h = await fixture(true);
  const actual = h.ports.exec;
  const original = kind === "unknown" ? new Error("Unexpected object executor failure") : new GitProcessError({ command: "git", args: ["show"],
    kind: kind === "signaled" ? "nonzero-exit" : kind, exitCode: 1, ...(kind === "signaled" ? { signal: "SIGTERM" } : {}) });
  h.ports.exec = async (command, args, options) => {
    if (args[0] === "show" && args.some((arg) => arg.includes(":.arc/active/meta-foreign.md"))) throw original;
    return actual(command, args, options);
  };
  if (kind === "unknown") await expect(h.store.list({ family: "work-item", kind: "work-item/meta" })).rejects.toMatchObject({ code: "store.operation-failed", cause: original });
  else await expect(h.store.list({ family: "work-item", kind: "work-item/meta" })).rejects.toBe(original);
  expect(success(await h.store.read({ reference: h.reference("work-item/meta", "neighbor") })).content).toContain("neighbor");
  h.ports.exec = actual;
  expect(success(await h.store.list({ family: "work-item", kind: "work-item/meta" }))).toMatchObject({ status: "complete", missed: false });
});
