/** Current-work-unit identity resolution uses real checkout files through the public store. */
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { resolveCurrentWorkUnit } from "../../../../src/lib/store/current-work-unit.js";
import { createStore } from "../../../../src/lib/store/create.js";
import { testStorePorts } from "../../../helpers/store/in-repo-ports.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { readActiveMetaCandidates } from "../../../../src/lib/active/meta-reader.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-current-work-unit-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, ".arc/active"), { recursive: true });
  const forbiddenGit = async () => { throw new Error("Current-work-unit resolution must spawn no Git process"); };
  const ports = testStorePorts(cwd, forbiddenGit, forbiddenGit);
  return { cwd, ports, store: createStore(ports),
    write: (slug: string, content: string) => writeFile(join(cwd, `.arc/active/meta-${slug}.md`), content) };
}

describe("current work-unit resolver", () => {
  it("resolves a real flat meta by identity outside Git with today's reader fields", async () => {
    const h = await fixture();
    await h.write("example", makeMetaFixture("example", { branch: "feat/example" }));
    const legacy = await readActiveMetaCandidates(h.cwd);
    const result = await resolveCurrentWorkUnit({ cwd: h.cwd, store: h.store });
    expect(result).toMatchObject({ status: "resolved", warnings: [], candidate: {
      reference: { kind: "work-item/meta", owner: { type: "work-item", name: "example" } },
      record: { branch: legacy.candidates[0]!.branch, state: legacy.candidates[0]!.state },
    } });
    expect(result.candidates).toHaveLength(1);
  });

  it.each(["Design", "Depends On"])("keeps a meta candidate rejected only by the %s record parser", async (field) => {
    const h = await fixture();
    const content = makeMetaFixture("example").replace(`- **${field}:** [none]`, `- **${field}:** [TBD]`);
    await h.write("example", content);
    expect(await readActiveMetaCandidates(h.cwd)).toMatchObject({ candidates: [{ filename: "meta-example.md" }], warnings: [] });
    const result = await resolveCurrentWorkUnit({ cwd: h.cwd, store: h.store });
    expect(result).toMatchObject({ status: "resolved", candidate: { reference: { owner: { name: "example" } },
      diagnostic: { kind: "malformed" } }, warnings: [] });
    expect(result.candidates[0]).not.toHaveProperty("record");
  });

  it("drops an unreadable meta with a warning and recovers once read access is restored", async () => {
    const h = await fixture();
    await h.write("example", makeMetaFixture("example"));
    const read = h.ports.fs.readFile;
    h.ports.fs.readFile = async (path) => {
      if (path.endsWith("meta-example.md")) throw Object.assign(new Error("Permission denied"), { code: "EACCES" });
      return read(path);
    };
    expect(await resolveCurrentWorkUnit({ cwd: h.cwd, store: h.store })).toMatchObject({ status: "none",
      warnings: [expect.stringContaining("Unable to read .arc/active/meta-example.md")] });
    h.ports.fs.readFile = read;
    expect(await resolveCurrentWorkUnit({ cwd: h.cwd, store: h.store })).toMatchObject({ status: "resolved", warnings: [] });
  });

  it("drops a malformed core table with today's warning and resolves after its repair", async () => {
    const h = await fixture();
    const valid = makeMetaFixture("example");
    await h.write("example", valid.replace(/^\| `Active`[^\n]*\n/mu, ""));
    const legacy = await readActiveMetaCandidates(h.cwd);
    expect(legacy.candidates).toEqual([]);
    const result = await resolveCurrentWorkUnit({ cwd: h.cwd, store: h.store });
    expect(result).toMatchObject({ status: "none", warnings: legacy.warnings });
    await h.write("example", valid);
    expect(await resolveCurrentWorkUnit({ cwd: h.cwd, store: h.store })).toMatchObject({ status: "resolved", warnings: [] });
  });

  it("keeps no candidate for a symbolic link to a meta", async () => {
    const h = await fixture();
    const outside = join(h.cwd, "elsewhere.md");
    await writeFile(outside, makeMetaFixture("example"));
    await symlink(outside, join(h.cwd, ".arc/active/meta-example.md"));
    expect(await resolveCurrentWorkUnit({ cwd: h.cwd, store: h.store })).toEqual({ status: "none", candidates: [], warnings: [] });
  });

  it("keeps ambiguous and empty occupancy distinct regardless of semantic State", async () => {
    const h = await fixture();
    expect(await resolveCurrentWorkUnit({ cwd: h.cwd, store: h.store })).toMatchObject({ status: "none", candidates: [] });
    await h.write("zebra", makeMetaFixture("zebra").replace("`Active`", "`unknown-state`"));
    await h.write("alpha", makeMetaFixture("alpha", { state: "Planning" }));
    const result = await resolveCurrentWorkUnit({ cwd: h.cwd, store: h.store });
    expect(result.status).toBe("ambiguous");
    expect(result.candidates.map((candidate) => candidate.reference.owner.name)).toEqual(["alpha", "zebra"]);
  });
});
