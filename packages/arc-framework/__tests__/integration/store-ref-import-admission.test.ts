/** Source defects refuse the entire import and admit it after the source is repaired. */
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { MigrateReportSchema, RecordReferenceSchema, createKindRegistry } from "../../src/lib/store/index.js";
import { importFixture, saveImportPersonal } from "../helpers/store/import-fixture.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";

const candidate = resolveArcPath({ kind: "candidate-record", slug: SlugSchema.parse("alpha") });
const cases = [
  { rule: "store.env-file", path: ".arc/user/andrew/private.env", content: "API_TOKEN=example\n", remove: true },
  { rule: "store.text-only", path: ".arc/active/extra-alpha.md", content: "binary\0content" },
  { rule: "store.size-cap", path: ".arc/active/extra-alpha.md", content: "x".repeat(1048577) },
  { rule: "store.private-key", path: ".arc/active/extra-alpha.md", content: "-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----\n" },
  { rule: "store.git-path", path: ".arc/user/andrew/git~1/example.md", content: "example\n", repairPath: ".arc/user/andrew/notes/example.md" },
  { rule: "store.git-path", path: ".arc/user/andrew/notes/.gitmodules", content: "example\n", repairPath: ".arc/user/andrew/notes/gitmodules.md" },
  { rule: "store.json", path: candidate, content: "not JSON", remove: true },
];

describe("import serialization admission", () => {
  it.each(cases)("lists $rule, lands nothing, and succeeds after repair", async ({ rule, path, content, repairPath, remove }) => {
    const h = await importFixture();
    const absolute = join(h.root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
    const trial = await h.migrate(true);
    expect(trial.status, JSON.stringify(trial)).toBe("ok");
    if (trial.status !== "ok") throw new Error("No trial report");
    const report = MigrateReportSchema.parse(trial.result);
    expect(report.refused).toEqual(expect.arrayContaining([expect.objectContaining({ rule })]));
    const refused = report.refused.find(row => row.rule === rule)!;
    const causes: Record<string, string> = { "store.text-only": "NUL byte", "store.size-cap": "1048576",
      "store.private-key": "private-key", "store.env-file": "environment file", "store.git-path": "Git-special", "store.json": "JSON" };
    expect(report.notices).toEqual(expect.arrayContaining([expect.objectContaining({
      condition: expect.stringContaining(JSON.stringify(refused.reference)), remedy: { text: expect.any(String) },
    })]));
    expect(report.notices.some(notice => notice.condition.includes(causes[rule]!))).toBe(true);
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: {
      code: "import-refused", report: { refused: expect.arrayContaining([expect.objectContaining({ rule })]) },
    } });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/", "refs/arc/user/", "refs/arc/project/"])).stdout).toBe("");
    if (repairPath || remove) await unlink(absolute);
    if (!remove) {
      const target = join(h.root, repairPath ?? path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, "Repaired source\n");
    }
    expect(await h.migrate()).toMatchObject({ status: "ok" });
  });
  it("imports unanchored bold-colon memory body text without inventing entries", async () => {
    const h = await importFixture();
    const path = join(h.root, ".arc/user/andrew/WORKING-MEMORY.md");
    const content = "# Working Memory\n\n## Memories\n\n**Remember this:**\n\nDetails\n";
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    await saveImportPersonal(h.root, false);
    const trial = await h.migrate(true);
    expect(trial.status, JSON.stringify(trial)).toBe("ok");
    if (trial.status !== "ok") throw new Error("No trial report");
    expect(MigrateReportSchema.parse(trial.result).refused).toEqual([]);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const reference = RecordReferenceSchema.parse({ kind: "personal/working-memory", owner: { type: "person", name: "andrew" } });
    expect(success(await createRefStore(h.ports).read({ reference })).content).toBe(content);
  });
  it.each([
    { defect: "companion alias", rule: "key", path: ".arc/active/errand-alpha.md", content: "Companion content\n", repairPath: ".arc/active/extra-alpha.md" },
    { defect: "repeated entry ID", rule: "entry-id", path: ".arc/user/andrew/WORKING-MEMORY.md", content: "# Working Memory\n\n## Memories\n\n**First:**\n_Remove when:_ complete.\n_Id:_ `11111111`\n\nDetails\n\n**Second:**\n_Remove when:_ complete.\n_Id:_ `11111111`\n\nDetails\n", fixed: "# Working Memory\n\n## Memories\n\n**First:**\n_Remove when:_ complete.\n\nDetails\n" },
  ])("refuses $defect until repaired", async ({ rule, path, content, repairPath, fixed }) => {
    const h = await importFixture();
    await mkdir(dirname(join(h.root, path)), { recursive: true });
    await writeFile(join(h.root, path), content);
    if (path.endsWith("WORKING-MEMORY.md")) await saveImportPersonal(h.root, false);
    const trial = await h.migrate(true);
    expect(trial.status, JSON.stringify(trial)).toBe("ok");
    if (trial.status !== "ok") throw new Error("No trial report");
    expect(MigrateReportSchema.parse(trial.result).refused).toEqual(expect.arrayContaining([expect.objectContaining({ rule })]));
    const cause = rule === "key" ? "errand" : "11111111";
    expect(trial.result.notices).toEqual(expect.arrayContaining([expect.objectContaining({
      condition: expect.stringContaining(cause), remedy: { text: expect.any(String) },
    })]));
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    if (repairPath) await unlink(join(h.root, path));
    await writeFile(join(h.root, repairPath ?? path), fixed ?? "Repaired companion\n");
    if (path.endsWith("WORKING-MEMORY.md")) await saveImportPersonal(h.root);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
  });
});

it("reports an ordinary parser cause without inventing an import rule and succeeds after repair", async () => {
  const h = await importFixture();
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  h.ports.registry = { ...registry, "cohort/document": { ...registry["cohort/document"],
    parser: () => ({ success: false, error: "Cohort source is not accepted" }) } };
  const trial = await h.migrate(true);
  expect(trial).toMatchObject({ status: "ok", result: { refused: [], notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining("Cohort source is not accepted"),
      remedy: { text: expect.stringContaining("parser") } }),
  ]) } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  h.ports.registry = registry;
  expect(await h.migrate()).toMatchObject({ status: "ok" });
});

it("explains serialization refused only after entry stamping and succeeds after shrinking the source", async () => {
  const h = await importFixture();
  const path = join(h.root, resolveArcPath({ kind: "inbox", scope: { kind: "project" } }));
  const prefix = "# Project Inbox\n\n## Inbox\n\n### **First**\n\nDetails.\n";
  await writeFile(path, prefix + "x".repeat(1048575 - prefix.length));
  await h.git("git", ["add", path]);
  await h.git("git", ["commit", "-m", "Seed large project inbox"]);
  const trial = await h.migrate(true);
  expect(trial).toMatchObject({ status: "ok", result: { refused: expect.arrayContaining([expect.objectContaining({ rule: "store.size-cap" })]),
    notices: expect.arrayContaining([expect.objectContaining({ condition: expect.stringContaining("1048576"),
      remedy: { text: expect.stringContaining("Reduce") } })]) } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  await writeFile(path, prefix);
  await h.git("git", ["add", path]);
  await h.git("git", ["commit", "-m", "Shrink project inbox"]);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
});
