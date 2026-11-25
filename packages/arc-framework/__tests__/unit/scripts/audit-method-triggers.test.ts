/**
 * Unit tests for the reliable-trigger audit.
 *
 * Covers enumeration (methods), frontmatter parsing, coverage map
 * construction, and diagnostic formatting. FS-facing
 * behaviors use tmp-dir fixtures; pure functions are exercised directly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  enumerateMethods,
  parseWorkflowFrontmatter,
  buildCoverageMap,
  formatMethodDiagnostic,
  audit,
  auditActivatableMethodCorpus,
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
    writeFileSync(join(dir, `${name}.md`), method(name));
  }
  return dir;
}

function method(name: string, dependencies: string[] = []): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${name} method`,
    ...(dependencies.length > 0
      ? ["arc:", "  methods:", ...dependencies.map((dependency) => `    - ${dependency}`)]
      : []),
    "override-active: false",
    "---",
    "",
  ].join("\n");
}

function workflow(methods: string[]): string {
  return [
    "---", "purpose: test", "audience: agent",
    ...(methods.length > 0 ? ["arc:", "  methods:", ...methods.map((m) => `    - ${m}`)] : []),
    "---", "", "# Workflow", "",
  ].join("\n");
}

// --- enumerateMethods ---

describe("enumerateMethods", () => {
  it("lists .md entries from methods dir and excludes README.md", () => {
    const dir = writeMethodsDir(["alpha", "beta", "gamma"]);
    expect(enumerateMethods(dir)).toEqual(["alpha", "beta", "gamma"]);
  });
});

describe("activatable method corpus", () => {
  function activationMethod(name: string, active: boolean): string {
    return [
      "---",
      `name: ${name}`,
      "description: Review activity",
      `active: ${String(active)}`,
      "override-active: false",
      "---",
      "",
    ].join("\n");
  }

  it("matches package frontmatter to the typed registry defaults", () => {
    const methods = writeMethodsDir([]);
    writeFileSync(join(methods, "code-review-author.md"), activationMethod("code-review-author", true));
    writeFileSync(join(methods, "code-review-frontline.md"), activationMethod("code-review-frontline", false));
    expect(auditActivatableMethodCorpus(methods)).toEqual([]);
  });

  it("detects missing entries, default drift, and activation on unregistered methods", () => {
    const methods = writeMethodsDir([]);
    writeFileSync(join(methods, "code-review-author.md"), activationMethod("code-review-author", false));
    writeFileSync(join(methods, "other.md"), activationMethod("other", true));
    const diagnostics = auditActivatableMethodCorpus(methods);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining("code-review-author"),
      expect.stringContaining("code-review-frontline"),
      expect.stringContaining("other"),
    ]));
  });
});

// --- parseWorkflowFrontmatter ---

describe("parseWorkflowFrontmatter", () => {
  it("parses arc.methods array from frontmatter", () => {
    const out = parseWorkflowFrontmatter(workflow(["alpha", "beta"]));
    expect(out.methods).toEqual(["alpha", "beta"]);
    expect(out.parseError).toBeUndefined();
  });

  it.each(["[]", "[post-x]", "post-x", "[post-x, false]"])("rejects the retired extension declaration %s", (value) => {
    const out = parseWorkflowFrontmatter(`---\narc:\n  extensions: ${value}\n---\n`);
    expect(out).toEqual({ methods: [], parseError: "unknown workflow `arc` frontmatter field `extensions`" });
  });

  it("returns empty methods and no error for a workflow without frontmatter", () => {
    const out = parseWorkflowFrontmatter("# Just a heading\n\nSome prose.\n");
    expect(out.methods).toEqual([]);
    expect(out.parseError).toBeUndefined();
  });

  it("reports a parseError for malformed YAML without throwing", () => {
    const bad = "---\narc:\n  methods:\n    - one\n   bad_indent: true\n---\n";
    const out = parseWorkflowFrontmatter(bad);
    expect(out.parseError).toBeDefined();
    expect(out.methods).toEqual([]);
  });

  it.each([
    ["a non-mapping arc declaration", "arc: []", '"arc" must be a mapping'],
    ["a non-array methods declaration", "arc:\n  methods: alpha", "arc.methods must be an array"],
    ["a mixed-type methods declaration", "arc:\n  methods: [alpha, 123]", "arc.methods must contain only strings"],
    [
      "an unknown arc field",
      "arc:\n  method: [alpha]",
      "unknown workflow `arc` frontmatter field `method`",
    ],
  ])("reports a parseError for %s", (_label, declaration, diagnostic) => {
    const out = parseWorkflowFrontmatter(`---\npurpose: test\n${declaration}\n---\n`);
    expect(out).toEqual({
      methods: [],
      parseError: diagnostic,
    });
  });
});

// --- buildCoverageMap ---

describe("buildCoverageMap", () => {
  function wf(path: string, methods: string[]): WorkflowEntry {
    return { path, content: workflow(methods) };
  }

  it("records workflow paths against declared methods", () => {
    const cov = buildCoverageMap(
      ["alpha", "beta"],
      [wf("a.md", ["alpha"]), wf("b.md", ["alpha", "beta"])],
    );
    expect(cov.methods.get("alpha")).toEqual(["a.md", "b.md"]);
    expect(cov.methods.get("beta")).toEqual(["b.md"]);
    expect(cov.parseDiagnostics).toEqual([]);
  });

  it("records malformed workflows as parse diagnostics and continues", () => {
    const cov = buildCoverageMap(
      ["alpha"],
      [
        { path: "bad.md", content: "---\n  not: [valid\n---\n" },
        wf("good.md", ["alpha"]),
      ],
    );
    expect(cov.parseDiagnostics).toHaveLength(1);
    expect(cov.parseDiagnostics[0]).toContain("bad.md");
    expect(cov.methods.get("alpha")).toEqual(["good.md"]);
  });

});

// --- Diagnostic formatters ---

describe("diagnostic formatters", () => {
  it("names the method and arc.methods in the method diagnostic", () => {
    const msg = formatMethodDiagnostic("alpha");
    expect(msg).toContain("Method \"alpha\"");
    expect(msg).toContain("arc.methods");
  });

});

// --- audit() end-to-end ---

describe("audit", () => {
  function writeWorkflow(rel: string, methods: string[]): void {
    writeFile(rel, workflow(methods));
  }

  it("passes when every method has a declaration", async () => {
    const methods = writeMethodsDir(["alpha"]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"]);
    const result = await audit(methods, workflows);
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("validates method coverage at managed push sites without hook declarations", async () => {
    const methods = writeMethodsDir(["alpha"]);
    writeFile("workflows/push.md", `${workflow(["alpha"])}\narc release push\n`);
    expect(await audit(methods, join(tmp, "workflows"))).toEqual({ pass: true, diagnostics: [] });
  });

  it("resolves method-owned dependencies transitively from workflow roots", async () => {
    const methods = writeMethodsDir(["alpha", "beta", "gamma"]);
    writeFileSync(join(methods, "alpha.md"), method("alpha", ["beta"]));
    writeFileSync(join(methods, "beta.md"), method("beta", ["gamma"]));
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"]);

    const result = await audit(methods, workflows);
    expect(result).toEqual({ pass: true, diagnostics: [] });
  });

  it("deduplicates a shared dependency reached through two roots", async () => {
    const methods = writeMethodsDir(["alpha", "beta", "shared"]);
    writeFileSync(join(methods, "alpha.md"), method("alpha", ["shared"]));
    writeFileSync(join(methods, "beta.md"), method("beta", ["shared"]));
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha", "beta"]);

    const result = await audit(methods, workflows, new Set(["shared"]));
    expect(result.diagnostics).toContain(
      "Method \"shared\" is declared by one.md but still listed in WIRING_PENDING. Remove the allowlist entry.",
    );
  });

  it("rejects an unknown workflow-root declaration", async () => {
    const methods = writeMethodsDir(["alpha"]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha", "missing"]);

    const result = await audit(methods, workflows);
    expect(result.diagnostics).toContain(
      'Workflow "one.md" declares unknown method "missing" in arc.methods.',
    );
  });

  it("rejects unknown workflow arc fields even when every method remains reachable", async () => {
    const methods = writeMethodsDir(["alpha"]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/good.md", ["alpha"]);
    writeFile("workflows/typo.md", "---\narc:\n  method: [alpha]\n---\n");

    const result = await audit(methods, workflows);
    expect(result.pass).toBe(false);
    expect(result.diagnostics).toContain(
      'Workflow "typo.md" has malformed frontmatter: unknown workflow `arc` frontmatter field `method`',
    );
  });

  it("rejects a method dependency whose target does not exist", async () => {
    const methods = writeMethodsDir(["alpha"]);
    writeFileSync(join(methods, "alpha.md"), method("alpha", ["missing"]));
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"]);

    const result = await audit(methods, workflows);
    expect(result.pass).toBe(false);
    expect(result.diagnostics).toContain(
      'Method "alpha" declares unknown method "missing" in arc.methods.',
    );
  });

  it("rejects dependency cycles with the complete cycle path", async () => {
    const methods = writeMethodsDir(["alpha", "beta"]);
    writeFileSync(join(methods, "alpha.md"), method("alpha", ["beta"]));
    writeFileSync(join(methods, "beta.md"), method("beta", ["alpha"]));
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"]);

    const result = await audit(methods, workflows);
    expect(result.pass).toBe(false);
    expect(result.diagnostics).toContain("Method dependency cycle: alpha -> beta -> alpha.");
  });

  it("fails with a method diagnostic when a method has no declaration", async () => {
    const methods = writeMethodsDir(["alpha", "beta"]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"]);
    const result = await audit(methods, workflows);
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => d.includes("\"beta\"") && d.includes("arc.methods"))).toBe(true);
  });

  it("passes when an undeclared method is listed as wiring-pending", async () => {
    const methods = writeMethodsDir(["alpha", "beta"]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"]);
    const result = await audit(methods, workflows, new Set(["beta"]));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails with a stale-allowlist diagnostic when a wiring-pending method gains a declaration", async () => {
    const methods = writeMethodsDir(["alpha"]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"]);
    const result = await audit(methods, workflows, new Set(["alpha"]));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some((d) => d.includes("\"alpha\"") && d.includes("WIRING_PENDING")),
    ).toBe(true);
  });
});
