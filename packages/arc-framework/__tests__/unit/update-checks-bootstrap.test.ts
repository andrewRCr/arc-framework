/** Installation retirement preserves authored commands without activating checks. */
import { afterEach, describe, expect, it } from "vitest";
import { access, chmod, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import { runReconfigure } from "../../src/commands/reconfigure.js";
import { runUpdate, buildUpdateSummary } from "../../src/commands/update.js";
import type { IOContext } from "../../src/commands/init.js";
import type { Manifest, Recipe } from "../../src/lib/types.js";
import { buildManifestFiles } from "../../src/lib/classification.js";
import { buildInstallConfig } from "../../src/lib/config/index.js";
import { getFrameworkVersion } from "../../src/lib/version.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { selectRequestChecks } from "../../src/lib/checks/gates.js";
import { editorDocumentReference } from "../../src/lib/schema-command/editor-documents.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const retired = ["system/methods/quality-gate-commands.md", "system/extensions/post-task-quality.md",
  "system/extensions/post-unit-quality.md"] as const;
const fenced = (command: string) => `\`\`\`bash\n${command}\n\`\`\``;
const oldFiles = {
  "README.md": "# Installed\n",
  "reference/QUICK-REFERENCE.md": `## Quality Gate Commands\n### Tier 1 increment\n${fenced("npm run lint")}\n`,
  [retired[0]]: `---\nname: quality-gate-commands\ndescription: Checks\noverride-active: true\n---\n`
    + `## quality-gate-commands.override\n### Tier 3 full\n${fenced("npm run build")}\n`,
  [retired[1]]: `---\nname: post-task-quality\ndescription: Extra checks\nactive: false\n---\n## post-task-quality.actions\n${fenced("npm run security")}\nInspect the security dashboard.\n`,
  [retired[2]]: `---\nname: post-unit-quality\ndescription: Extra checks\nactive: false\n---\n## post-unit-quality.actions\n${fenced("npm test")}\n`,
};
const recipe: Recipe = { include_files: ["README.md", "reference/QUICK-REFERENCE.template.md"], prompts: [], conditions: {} };
async function setup(existingDeclaration?: string) {
  const cwd = await mkdtemp(join(tmpdir(), "arc-check-bootstrap-"));
  directories.push(cwd);
  const put = async (path: string, content: string) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, content); };
  const manifest: Manifest = { schema_version: 1, framework_version: getFrameworkVersion(), installed_at: "2026-01-01T00:00:00Z",
    install_config: buildInstallConfig({ project_name: "Checks", pm_mode: "none", tools: [], team_mode: false }),
    files: buildManifestFiles(oldFiles, new Set(), { "reference/QUICK-REFERENCE.md": "reference/QUICK-REFERENCE.template.md" }) };
  for (const [path, content] of Object.entries(oldFiles)) await put(join(cwd, ".arc", path), content);
  await put(join(cwd, ".arc/system/.internal/manifest.json"), JSON.stringify(manifest));
  await put(join(cwd, ".arc/system/.internal/pristine.json"), JSON.stringify(oldFiles));
  const templateDir = join(cwd, "templates");
  await put(join(templateDir, "README.md"), oldFiles["README.md"]);
  await put(join(templateDir, "reference/QUICK-REFERENCE.template.md"), "");
  if (existingDeclaration !== undefined) await put(join(cwd, ".arc/system/arc-checks.yml"), existingDeclaration);
  const io: IOContext = {
    readFile: path => readFile(path, "utf8"), writeFile: put,
    mkdir: async (path, options) => { await mkdir(path, options); }, access, chmod,
    exclusiveCreate: async (path, content) => { await writeFile(path, content, { flag: "wx" }); }, removeFile: unlink,
    exec: async () => ({ stdout: "", stderr: "" }),
    writeEditorDocuments: async () => ({ ok: true, documents: [] }),
  };
  return { cwd, io, templateDir, recipe, manifest };
}

describe("check bootstrap on retirement", () => {
  it("writes the old sources before update rewrites them and reports every extracted and prose action", async () => {
    const fixture = await setup();
    const result = await runUpdate(fixture);
    expect(await readFile(join(fixture.cwd, ".arc/reference/QUICK-REFERENCE.md"), "utf8")).toBe("");
    const content = await readFile(join(fixture.cwd, ".arc/system/arc-checks.yml"), "utf8").catch(() => null);
    expect(content).not.toBeNull();
    if (content === null) return;
    const reference = editorDocumentReference("check-declaration", ".arc/system/arc-checks.yml");
    expect(reference.status).toBe("found");
    if (reference.status === "found") expect(content.split("\n")[0]).toBe(reference.reference);
    const declaration = CheckDeclarationSchema.parse(yaml.load(content));
    expect(Object.values(declaration.checks).map(entry => entry.command)).toEqual([
      "npm run lint", "npm run build", "npm run security", "npm test",
    ]);
    for (const gate of ["commit", "push", "merge"] as const) expect(selectRequestChecks(declaration.checks, { kind: "gate", gate })).toEqual([]);
    const summary = buildUpdateSummary(result);
    for (const command of ["npm run lint", "npm run build", "npm run security", "npm test"]) expect(summary).toContain(command);
    for (const source of retired) expect(summary).toContain(source);
    expect(summary).toContain("reference/QUICK-REFERENCE.md");
    expect(summary).toContain("Inspect the security dashboard.");
  });
  it("preserves an existing declaration byte for byte while still reporting retired sources", async () => {
    const existing = "# Project-owned configuration\nchecks:\n  custom:\n    command: [node, verify.js]\n    gate: push\n";
    const fixture = await setup(existing);
    const result = await runUpdate(fixture);
    expect(await readFile(join(fixture.cwd, ".arc/system/arc-checks.yml"), "utf8")).toBe(existing);
    const summary = buildUpdateSummary(result);
    expect(summary).toContain("Existing .arc/system/arc-checks.yml preserved");
    for (const command of ["npm run lint", "npm run build", "npm run security", "npm test"]) expect(summary).toContain(command);
    expect(summary).toContain("Inspect the security dashboard.");
  });

  it.each(["remove", "keep"] as const)("proposes checks when reconfigure chooses to %s retired files", async action => {
    const fixture = await setup();
    const result = await runReconfigure({ ...fixture, newInstallConfig: fixture.manifest.install_config,
      resolveRemovals: async removals => removals.map(removal => ({ ...removal, action })),
    });
    const content = await readFile(join(fixture.cwd, ".arc/system/arc-checks.yml"), "utf8").catch(() => null);
    expect(content).not.toBeNull();
    if (content === null || "dryRun" in result) return;
    const declaration = CheckDeclarationSchema.parse(yaml.load(content));
    expect(Object.values(declaration.checks).map(entry => entry.command)).toEqual([
      "npm run lint", "npm run build", "npm run security", "npm test",
    ]);
    expect(result.checkBootstrap?.commands.map(entry => entry.command)).toEqual([
      "npm run lint", "npm run build", "npm run security", "npm test",
    ]);
    expect(result.checkBootstrap?.unextractable).toContainEqual({ source: ".arc/system/extensions/post-task-quality.md",
      text: "Inspect the security dashboard." });
    const remaining = await Promise.all(retired.map(path => access(join(fixture.cwd, ".arc", path)).then(() => true, () => false)));
    expect(remaining).toEqual(retired.map(() => action === "keep"));
    const manifest = JSON.parse(await readFile(join(fixture.cwd, ".arc/system/.internal/manifest.json"), "utf8")) as Manifest;
    for (const path of retired) expect(manifest.files[path]).toBeUndefined();
  });

});
