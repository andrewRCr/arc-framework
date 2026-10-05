/** Semantic inbox access agrees with installation and the existing project viewer. */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveArcPath, resolveTemplateOutputPath } from "../../src/lib/layout/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/index.js";
import { resolveViewArtifact } from "../../src/lib/view-artifact.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

const reference = recordReferences["project-inbox/inbox"](OwnerIdentitySchema.parse({ type: "project", name: "project" }));
const installedPath = ".arc/backlog/ATOMIC-INBOX.md";

describe("project inbox surface", () => {
  it("maps the semantic scope to the installed template and existing viewer", async () => {
    const h = await trackedWriteFixture();
    const recipe = JSON.parse(await readFile(new URL("../../init-recipe.json", import.meta.url), "utf8")) as {
      conditions: Record<string, { include_files: string[] }>;
    };
    expect(recipe.conditions["pm.mode == arc-in-git"]?.include_files).toContain("backlog/ATOMIC-INBOX.template.md");
    expect(`.arc/${resolveTemplateOutputPath("backlog/ATOMIC-INBOX.template.md")}`).toBe(installedPath);
    const path = join(h.root, installedPath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "# Inbox\n");
    const unused = async (): Promise<never> => { throw new Error("Project inbox has no work-unit or personal target"); };
    const view = await resolveViewArtifact({ cwd: h.root, kind: "inbox", project: true, identity: null }, {
      resolveAmbientTarget: unused, resolveExplicitTarget: unused, resolveCohort: unused,
      resolveSessionNotes: unused, resolveUserSurfaces: unused,
      pathExists: (target) => access(target).then(() => true, () => false),
    });
    expect(view).toMatchObject({ status: "resolved", path });
    expect(resolveArcPath({ kind: "inbox", scope: { kind: "project" } })).toBe(installedPath);
  });

  it.each(["write", "batch"] as const)("reads and updates existing bytes through %s without creating a competing inbox", async (operation) => {
    const h = await trackedWriteFixture();
    const path = join(h.root, installedPath);
    const original = "# Project Inbox\n\n## Atomic\n\n### **Existing item**\n\nKeep this entry.\n";
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, original);
    const record = success(await h.store.read({ reference }));
    expect(record.content).toBe(original);
    const listed = success(await h.store.list({ family: "project-inbox", kind: "project-inbox/inbox" }));
    expect(listed).toMatchObject({ status: "complete", records: [{ reference, version: record.version, content: original }], missed: false });
    const content = `${original}\n### **Added item**\n\nNew entry.\n`;
    const mutation = { action: "put" as const, reference, expected: record.version, content };
    if (operation === "write") success(await h.store.write({ ...mutation, provenance: testProvenance }));
    else success(await h.store.batch({ writes: [mutation], provenance: testProvenance }));
    expect(await readFile(path, "utf8")).toBe(content);
    expect(success(await h.store.read({ reference })).content).toBe(content);
    await expect(access(join(h.root, ".arc/ATOMIC-INBOX.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
