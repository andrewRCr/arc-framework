/** Built-CLI editor-document installation and recoverable failures. */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SchemaInstallEnvelopeSchema, SchemaRefusalEnvelopeSchema,
} from "../../src/lib/schema-command/envelope.js";
import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";

const directory = ".arc/system/.internal/schemas";
describe("arc schema install", () => {
  let root: string;
  beforeEach(async () => { root = await createTempRepo(); });
  afterEach(async () => { await cleanupTempDir(root); });

  it("refreshes an existing checkout without changing tracked ignore rules", async () => {
    const init = await runArc(["init", "--yes", "--name", "schema-install-test"], root);
    expect(init.exitCode, init.stderr).toBe(0);
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "seed"]);
    const ignored = await readFile(join(root, ".gitignore"), "utf8");
    const result = await runArc(["schema", "install", "--json"], root);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(SchemaInstallEnvelopeSchema.parse(JSON.parse(result.stdout))).toEqual({ status: "ok", documents: [] });
    expect(await readdir(join(root, directory))).toEqual([]);
    expect(await readFile(join(root, ".git/info/exclude"), "utf8")).toContain(`${directory}/\n`);
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(ignored);
    expect(await git(root, ["status", "--porcelain"])).toBe("");
    const plain = await runArc(["schema", "install"], root);
    expect(plain.exitCode, plain.stderr).toBe(0);
  });

  it("refuses outside a project with JSON alone", async () => {
    const result = await runArc(["schema", "install", "--json"], root);
    expect(result.exitCode).toBe(1);
    expect(SchemaRefusalEnvelopeSchema.parse(JSON.parse(result.stdout))).toEqual({
      status: "refused", reason: "arc-project-root-unresolved",
    });
    expect(result.stderr).toBe("");
  });

  it("reports a document failure and succeeds after its blocking file is repaired", async () => {
    await mkdir(join(root, ".arc/system"), { recursive: true });
    const blocking = join(root, ".arc/system/.internal");
    await writeFile(blocking, "blocking file");
    const refused = await runArc(["schema", "install", "--json"], root);
    expect(refused.exitCode).toBe(1);
    expect(SchemaRefusalEnvelopeSchema.parse(JSON.parse(refused.stdout))).toMatchObject({
      status: "refused", reason: "editor-documents-unwritable", target: "documents", path: join(root, directory),
      remedy: expect.stringContaining("arc schema install"),
    });
    await rm(blocking);
    const repaired = await runArc(["schema", "install", "--json"], root);
    expect(repaired.exitCode, repaired.stderr).toBe(0);
    expect(SchemaInstallEnvelopeSchema.parse(JSON.parse(repaired.stdout))).toEqual({ status: "ok", documents: [] });
    expect(await readdir(join(root, directory))).toEqual([]);
  });

  it("reports an exclude failure and succeeds after the exclude file is repaired", async () => {
    await mkdir(join(root, ".arc"));
    const exclude = join(root, ".git/info/exclude");
    await rm(exclude);
    await mkdir(exclude);
    const refused = await runArc(["schema", "install", "--json"], root);
    expect(refused.exitCode).toBe(1);
    expect(SchemaRefusalEnvelopeSchema.parse(JSON.parse(refused.stdout))).toMatchObject({
      status: "refused", reason: "editor-documents-unwritable", target: "exclude", path: exclude,
      remedy: expect.stringContaining("arc schema install"),
    });
    await rm(exclude, { recursive: true });
    const repaired = await runArc(["schema", "install", "--json"], root);
    expect(repaired.exitCode, repaired.stderr).toBe(0);
    expect(SchemaInstallEnvelopeSchema.parse(JSON.parse(repaired.stdout))).toEqual({ status: "ok", documents: [] });
  });

  it("reports an exclude refusal without a path outside a Git checkout", async () => {
    const outside = await mkdtemp(join(tmpdir(), "arc-schema-not-git-"));
    try {
      await mkdir(join(outside, ".arc"));
      const result = await runArc(["schema", "install", "--json"], outside);
      expect(result.exitCode).toBe(1);
      const payload = SchemaRefusalEnvelopeSchema.parse(JSON.parse(result.stdout));
      expect(payload).toMatchObject({ status: "refused", reason: "editor-documents-unwritable", target: "exclude" });
      expect(payload).not.toHaveProperty("path");
      expect(result.stderr).toBe("");
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
});
