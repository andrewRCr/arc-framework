/** Owner-scoped companion listings retain only relevant placement and acquisition failures. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { StateVersionSchema } from "../../src/lib/store/identity.js";
import type { ListInput } from "../../src/lib/store/read.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const modes = ["live", "held", "saved"] as const;
const kinds = ["work-item/notes", "work-item/companion"] as const;

async function fixture() {
  const h = await trackedWriteFixture();
  const put = async (path: string, content: string) => {
    await mkdir(dirname(join(h.root, path)), { recursive: true });
    await writeFile(join(h.root, path), content);
  };
  const save = async () => {
    await h.exec("git", ["add", "-A"]);
    await h.exec("git", ["commit", "-m", "fixture records"]);
    return StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
  };
  await put(".arc/active/meta-neighbor.md", makeMetaFixture("neighbor", { branch: "main" }));
  await put(".arc/active/notes-neighbor.md", "neighbor notes\n");
  await put(".arc/active/research-neighbor.md", "neighbor research\n");
  let head = await save();
  const query = async (mode: typeof modes[number], kind: typeof kinds[number], name?: string) => {
    const input: ListInput = { family: "work-item", kind,
      ...(name === undefined ? {} : { owner: h.reference("work-item/meta", name).owner }),
      ...(mode === "held" ? { filter: { heldHere: true } } : {}), ...(mode === "saved" ? { asOf: head } : {}) };
    const result = success(await h.store.list(input));
    if ("asOf" in result) {
      const { asOf, ...outcome } = result;
      expect(asOf).toBe(head);
      return outcome;
    }
    return result;
  };
  return { ...h, put, query, save: async () => { head = await save(); } };
}

it.each(modes)("isolates foreign placement failures in %s companion listings and repairs", async (mode) => {
  const h = await fixture();
  const healthy = await Promise.all(kinds.map((kind) => h.query(mode, kind, "neighbor")));
  for (const result of healthy) expect(result).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
  const badPath = ".arc/backlog/planned/Bad_Group/meta-foreign.md";
  await h.put(badPath, makeMetaFixture("foreign", { state: "Planning" })); await h.save();
  expect(await Promise.all(kinds.map((kind) => h.query(mode, kind, "neighbor")))).toEqual(healthy);
  for (const kind of kinds) {
    expect(await h.query(mode, kind, "missing")).toMatchObject({ status: "absent" });
    expect(await h.query(mode, kind, "foreign")).toMatchObject({ status: "complete", records: [], missed: true,
      diagnostics: [expect.objectContaining({ rule: "placement", key: badPath })] });
    expect(await h.query(mode, kind)).toMatchObject({ status: "complete", missed: true,
      diagnostics: [expect.objectContaining({ rule: "placement", key: badPath })] });
  }
  await rm(join(h.root, badPath));
  await h.put(".arc/active/meta-foreign.md", makeMetaFixture("foreign", { branch: "main" }));
  await h.put(".arc/active/notes-foreign.md", "foreign notes\n");
  await h.put(".arc/active/research-foreign.md", "foreign research\n"); await h.save();
  expect(await Promise.all(kinds.map((kind) => h.query(mode, kind, "neighbor")))).toEqual(healthy);
  for (const kind of kinds) {
    expect(await h.query(mode, kind, "missing")).toMatchObject({ status: "absent" });
    const repaired = await h.query(mode, kind, "foreign");
    expect(repaired).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
    if (repaired.status === "complete") expect(repaired.records.map((record) => record.reference.owner.name)).toEqual(["foreign"]);
  }
});

it.each(modes)("retains unknown owner coordinates in %s scoped companion listings and repairs", async (mode) => {
  const h = await fixture();
  const badPath = ".arc/active/meta-Bad_Name.md";
  await h.put(badPath, makeMetaFixture("unknown", { branch: "main" })); await h.save();
  for (const name of ["neighbor", "missing"]) {
    for (const kind of kinds) expect(await h.query(mode, kind, name)).toMatchObject({ status: "complete", missed: true,
      diagnostics: [expect.objectContaining({ kind: "malformed", key: badPath })] });
  }
  await rm(join(h.root, badPath)); await h.save();
  for (const kind of kinds) {
    expect(await h.query(mode, kind, "neighbor")).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
    expect(await h.query(mode, kind, "missing")).toMatchObject({ status: "absent" });
  }
});

it("isolates foreign companion enumeration failures while retaining requested-owner failures and repairs", async () => {
  const h = await fixture();
  const home = ".arc/backlog/planned/foreign";
  await h.put(`${home}/meta-foreign.md`, makeMetaFixture("foreign", { state: "Planning" }));
  await h.put(`${home}/research-foreign.md`, "foreign research\n"); await h.save();
  const actual = h.ports.fs.readdir;
  let reads = 0;
  h.ports.fs.readdir = async (path) => {
    if (path === join(h.root, home) && ++reads > 1) throw Object.assign(new Error("Directory access denied"), { code: "EACCES" });
    return actual(path);
  };
  for (const name of ["neighbor", "missing", "foreign", undefined]) {
    reads = 0;
    const result = await h.query("held", "work-item/companion", name);
    if (name === "neighbor") expect(result).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
    else if (name === "missing") expect(result).toMatchObject({ status: "absent" });
    else if (name === "foreign") expect(result.status).toBe("unreadable");
    else expect(result).toMatchObject({ status: "complete", missed: true,
      diagnostics: [expect.objectContaining({ kind: "unreadable", key: home })] });
  }
  h.ports.fs.readdir = actual;
  expect(await h.query("held", "work-item/companion", "foreign")).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
});
