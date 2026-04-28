/**
 * Unit tests for the reliable-trigger audit.
 *
 * Covers enumeration (methods/extensions), frontmatter parsing, coverage map
 * construction (separate maps per kind), and diagnostic formatting. FS-facing
 * behaviors use tmp-dir fixtures; pure functions are exercised directly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  enumerateMethods,
  enumerateExtensions,
  parseWorkflowFrontmatter,
  buildCoverageMap,
  formatMethodDiagnostic,
  formatExtensionDiagnostic,
  audit,
  type WorkflowEntry,
} from "../../../src/scripts/audit-method-triggers.js";

// --- Fixtures ---

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "audit-triggers-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeFile(rel: string, content: string): string {
  const full = join(tmp, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
  return full;
}

function writeMethodsDir(entries: string[]): string {
  const dir = join(tmp, "methods");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "README.md"), "# readme\n");
  for (const name of entries) {
    writeFileSync(join(dir, `${name}.md`), `---\nname: ${name}\n---\n`);
  }
  return dir;
}

function writeExtensionsDir(entries: string[]): string {
  const dir = join(tmp, "extensions");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "README.md"), "# readme\n");
  for (const name of entries) {
    writeFileSync(join(dir, `${name}.md`), `---\nname: ${name}\n---\n`);
  }
  return dir;
}

function workflow(methods: string[], extensions: string[]): string {
  const body = [
    "---",
    "purpose: test",
    "audience: agent",
    "arc:",
    "  methods:",
    ...methods.map((m) => `    - ${m}`),
    "  extensions:",
    ...extensions.map((e) => `    - ${e}`),
    "---",
    "",
    "# Workflow",
    "",
  ].join("\n");
  return body;
}

// --- enumerateMethods / enumerateExtensions ---

describe("enumerateMethods", () => {
  it("lists .md entries from methods dir and excludes README.md", () => {
    const dir = writeMethodsDir(["alpha", "beta", "gamma"]);
    expect(enumerateMethods(dir)).toEqual(["alpha", "beta", "gamma"]);
  });
});

describe("enumerateExtensions", () => {
  it("lists .md entries from extensions dir and excludes README.md", () => {
    const dir = writeExtensionsDir(["x-one", "x-two"]);
    expect(enumerateExtensions(dir)).toEqual(["x-one", "x-two"]);
  });
});

// --- parseWorkflowFrontmatter ---

describe("parseWorkflowFrontmatter", () => {
  it("parses arc.methods array from frontmatter", () => {
    const out = parseWorkflowFrontmatter(workflow(["alpha", "beta"], []));
    expect(out.methods).toEqual(["alpha", "beta"]);
    expect(out.extensions).toEqual([]);
    expect(out.parseError).toBeUndefined();
  });

  it("parses arc.extensions array from frontmatter", () => {
    const out = parseWorkflowFrontmatter(workflow([], ["ext-one", "ext-two"]));
    expect(out.extensions).toEqual(["ext-one", "ext-two"]);
    expect(out.methods).toEqual([]);
  });

  it("returns empty arrays and no error for a workflow without frontmatter", () => {
    const out = parseWorkflowFrontmatter("# Just a heading\n\nSome prose.\n");
    expect(out.methods).toEqual([]);
    expect(out.extensions).toEqual([]);
    expect(out.parseError).toBeUndefined();
  });

  it("reports a parseError for malformed YAML without throwing", () => {
    const bad = "---\narc:\n  methods:\n    - one\n   bad_indent: true\n---\n";
    const out = parseWorkflowFrontmatter(bad);
    expect(out.parseError).toBeDefined();
    expect(out.methods).toEqual([]);
    expect(out.extensions).toEqual([]);
  });
});

// --- buildCoverageMap ---

describe("buildCoverageMap", () => {
  function wf(path: string, methods: string[], extensions: string[]): WorkflowEntry {
    return { path, content: workflow(methods, extensions) };
  }

  it("records workflow paths against declared methods", () => {
    const cov = buildCoverageMap(
      ["alpha", "beta"],
      [],
      [wf("a.md", ["alpha"], []), wf("b.md", ["alpha", "beta"], [])],
    );
    expect(cov.methods.get("alpha")).toEqual(["a.md", "b.md"]);
    expect(cov.methods.get("beta")).toEqual(["b.md"]);
    expect(cov.parseDiagnostics).toEqual([]);
  });

  it("records malformed workflows as parse diagnostics and continues", () => {
    const cov = buildCoverageMap(
      ["alpha"],
      [],
      [
        { path: "bad.md", content: "---\n  not: [valid\n---\n" },
        wf("good.md", ["alpha"], []),
      ],
    );
    expect(cov.parseDiagnostics).toHaveLength(1);
    expect(cov.parseDiagnostics[0]).toContain("bad.md");
    expect(cov.methods.get("alpha")).toEqual(["good.md"]);
  });

  it("keeps methods and extensions in separate maps (no cross-kind collision)", () => {
    // Same name registered as both a method and an extension; declaring it
    // only in arc.methods must NOT satisfy the extension requirement.
    const cov = buildCoverageMap(
      ["shared"],
      ["shared"],
      [wf("a.md", ["shared"], [])],
    );
    expect(cov.methods.get("shared")).toEqual(["a.md"]);
    expect(cov.extensions.get("shared")).toEqual([]);
  });
});

// --- Diagnostic formatters ---

describe("diagnostic formatters", () => {
  it("names the method and arc.methods in the method diagnostic", () => {
    const msg = formatMethodDiagnostic("alpha");
    expect(msg).toContain("Method \"alpha\"");
    expect(msg).toContain("arc.methods");
  });

  it("names the extension and arc.extensions in the extension diagnostic", () => {
    const msg = formatExtensionDiagnostic("post-context-load");
    expect(msg).toContain("Extension \"post-context-load\"");
    expect(msg).toContain("arc.extensions");
  });
});

// --- audit() end-to-end ---

describe("audit", () => {
  function writeWorkflow(rel: string, methods: string[], extensions: string[]): void {
    writeFile(rel, workflow(methods, extensions));
  }

  it("passes when every method and extension has a declaration", async () => {
    const methods = writeMethodsDir(["alpha"]);
    const extensions = writeExtensionsDir(["post-x"]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"], ["post-x"]);
    const result = await audit(methods, extensions, workflows);
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails with a method diagnostic when a method has no declaration", async () => {
    const methods = writeMethodsDir(["alpha", "beta"]);
    const extensions = writeExtensionsDir([]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"], []);
    const result = await audit(methods, extensions, workflows);
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("\"beta\"") && d.includes("arc.methods"))).toBe(true);
  });

  it("fails with an extension diagnostic when an extension has no declaration", async () => {
    const methods = writeMethodsDir([]);
    const extensions = writeExtensionsDir(["post-x"]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", [], []);
    const result = await audit(methods, extensions, workflows);
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("\"post-x\"") && d.includes("arc.extensions"))).toBe(true);
  });
});
