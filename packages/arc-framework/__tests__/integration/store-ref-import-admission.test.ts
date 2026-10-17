/** Source defects refuse the entire import and admit it after the source is repaired. */
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { MigrateReportSchema } from "../../src/lib/store/index.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";

const candidate = resolveArcPath({ kind: "candidate-record", slug: SlugSchema.parse("alpha") });
const cases = [
  { rule: "store.text-only", path: ".arc/active/extra-alpha.md", content: "binary\0content" },
  { rule: "store.size-cap", path: ".arc/active/extra-alpha.md", content: "x".repeat(1048577) },
  { rule: "store.env-file", path: ".arc/user/andrew/settings.env", content: "EXAMPLE=value\n", repairPath: ".arc/user/andrew/settings.txt" },
  { rule: "store.private-key", path: ".arc/active/extra-alpha.md", content: "-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----\n" },
  { rule: "store.git-path", path: ".arc/user/andrew/git~1/example.md", content: "example\n", repairPath: ".arc/user/andrew/notes/example.md" },
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
  it.each([
    { defect: "companion alias", rule: "key", path: ".arc/active/errand-alpha.md", content: "Companion content\n", repairPath: ".arc/active/extra-alpha.md" },
    { defect: "unstampable memory", rule: "entry-id", path: ".arc/user/andrew/WORKING-MEMORY.md", content: "# Working Memory\n\n## Memories\n\n**Remember this:**\n\nDetails\n", fixed: "# Working Memory\n\n## Memories\n\n**Remember this:**\n_Remove when:_ complete.\n\nDetails\n" },
    { defect: "repeated entry ID", rule: "entry-id", path: ".arc/user/andrew/WORKING-MEMORY.md", content: "# Working Memory\n\n## Memories\n\n**First:**\n_Remove when:_ complete.\n_Id:_ `11111111`\n\nDetails\n\n**Second:**\n_Remove when:_ complete.\n_Id:_ `11111111`\n\nDetails\n", fixed: "# Working Memory\n\n## Memories\n\n**First:**\n_Remove when:_ complete.\n\nDetails\n" },
  ])("refuses $defect until repaired", async ({ rule, path, content, repairPath, fixed }) => {
    const h = await importFixture();
    await mkdir(dirname(join(h.root, path)), { recursive: true });
    await writeFile(join(h.root, path), content);
    const trial = await h.migrate(true);
    expect(trial.status, JSON.stringify(trial)).toBe("ok");
    if (trial.status !== "ok") throw new Error("No trial report");
    expect(MigrateReportSchema.parse(trial.result).refused).toEqual(expect.arrayContaining([expect.objectContaining({ rule })]));
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    if (repairPath) await unlink(join(h.root, path));
    await writeFile(join(h.root, repairPath ?? path), fixed ?? "Repaired companion\n");
    expect(await h.migrate()).toMatchObject({ status: "ok" });
  });
});
