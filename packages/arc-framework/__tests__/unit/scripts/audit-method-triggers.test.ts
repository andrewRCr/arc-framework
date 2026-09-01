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
  auditActivatableMethodCorpus,
  auditPushExtensionCoverage,
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
    ...(methods.length > 0
      ? ["  methods:", ...methods.map((m) => `    - ${m}`)]
      : []),
    ...(extensions.length > 0
      ? ["  extensions:", ...extensions.map((e) => `    - ${e}`)]
      : []),
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
    writeFileSync(join(methods, "self-review.md"), activationMethod("self-review", true));
    writeFileSync(join(methods, "frontline-review.md"), activationMethod("frontline-review", false));
    expect(auditActivatableMethodCorpus(methods)).toEqual([]);
  });

  it("detects missing entries, default drift, and activation on unregistered methods", () => {
    const methods = writeMethodsDir([]);
    writeFileSync(join(methods, "self-review.md"), activationMethod("self-review", false));
    writeFileSync(join(methods, "other.md"), activationMethod("other", true));
    const diagnostics = auditActivatableMethodCorpus(methods);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining("self-review"),
      expect.stringContaining("frontline-review"),
      expect.stringContaining("other"),
    ]));
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
  it.each([
    ["a non-mapping arc declaration", "arc: []", '"arc" must be a mapping'],
    ["a non-array methods declaration", "arc:\n  methods: alpha", "arc.methods must be an array"],
    ["a mixed-type methods declaration", "arc:\n  methods: [alpha, 123]", "arc.methods must contain only strings"],
    ["a non-array extensions declaration", "arc:\n  extensions: post-x", "arc.extensions must be an array"],
    [
      "an unknown arc field",
      "arc:\n  method: [alpha]",
      "unknown workflow `arc` frontmatter field `method`",
    ],
    [
      "a mixed-type extensions declaration",
      "arc:\n  extensions: [post-x, false]",
      "arc.extensions must contain only strings",
    ],
  ])("reports a parseError for %s", (_label, declaration, diagnostic) => {
    const out = parseWorkflowFrontmatter(`---\npurpose: test\n${declaration}\n---\n`);
    expect(out).toEqual({
      methods: [],
      extensions: [],
      parseError: diagnostic,
    });
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

describe("push extension coverage", () => {
  it("accepts local and workflow-wide pre-push fire contracts", () => {
    const local = `${workflow([], ["pre-push-review"])}\n- **Extensions** · \`#pre-push-review\`: Run before push.\n\n> \`push-interlock\` release — \`workflowPush\`.\n`;
    const global = `${workflow([], ["pre-push-review"])}\n**Push extension contract** · \`#pre-push-review\`: Before every agent-managed push, run it.\n\n> \`push-interlock\` release — \`workflowPush\`.\n\n> \`push-interlock\` release — \`workflowPush\`.\n`;

    expect(auditPushExtensionCoverage([
      { path: "local.md", content: local },
      { path: "global.md", content: global },
    ])).toEqual([]);
  });

  it("rejects a push without declaration or a preceding fire contract", () => {
    const bare = `${workflow([], [])}\n> \`push-interlock\` release — \`workflowPush\`.\n`;
    const declared = `${workflow([], ["pre-push-review"])}\n> \`push-interlock\` release — \`workflowPush\`.\n`;

    expect(auditPushExtensionCoverage([
      { path: "bare.md", content: bare },
      { path: "declared.md", content: declared },
    ])).toEqual(expect.arrayContaining([
      expect.stringContaining("bare.md"),
      expect.stringContaining("declared.md"),
    ]));
  });

  it.each(["arc sync --json", "arc release push"])(
    "treats command-form %s as an agent-managed push site",
    (command) => {
      const content = `${workflow([], [])}\n\`\`\`bash\n${command}\n\`\`\`\n`;

      const diagnostics = auditPushExtensionCoverage([{ path: "handoff.md", content }]);
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics.every((item) => item.includes("handoff.md"))).toBe(true);
    },
  );
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

  it("resolves method-owned dependencies transitively from workflow roots", async () => {
    const methods = writeMethodsDir(["alpha", "beta", "gamma"]);
    writeFileSync(join(methods, "alpha.md"), method("alpha", ["beta"]));
    writeFileSync(join(methods, "beta.md"), method("beta", ["gamma"]));
    const extensions = writeExtensionsDir([]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"], []);

    const result = await audit(methods, extensions, workflows);
    expect(result).toEqual({ pass: true, diagnostics: [] });
  });

  it("deduplicates a shared dependency reached through two roots", async () => {
    const methods = writeMethodsDir(["alpha", "beta", "shared"]);
    writeFileSync(join(methods, "alpha.md"), method("alpha", ["shared"]));
    writeFileSync(join(methods, "beta.md"), method("beta", ["shared"]));
    const extensions = writeExtensionsDir([]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha", "beta"], []);

    const result = await audit(methods, extensions, workflows, new Set(["shared"]));
    expect(result.diagnostics).toContain(
      "Method \"shared\" is declared by one.md but still listed in WIRING_PENDING. Remove the allowlist entry.",
    );
  });

  it("rejects an unknown workflow-root declaration", async () => {
    const methods = writeMethodsDir(["alpha"]);
    const extensions = writeExtensionsDir([]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha", "missing"], []);

    const result = await audit(methods, extensions, workflows);
    expect(result.diagnostics).toContain(
      'Workflow "one.md" declares unknown method "missing" in arc.methods.',
    );
  });

  it("rejects a method dependency whose target does not exist", async () => {
    const methods = writeMethodsDir(["alpha"]);
    writeFileSync(join(methods, "alpha.md"), method("alpha", ["missing"]));
    const extensions = writeExtensionsDir([]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"], []);

    const result = await audit(methods, extensions, workflows);
    expect(result.pass).toBe(false);
    expect(result.diagnostics).toContain(
      'Method "alpha" declares unknown method "missing" in arc.methods.',
    );
  });

  it("rejects dependency cycles with the complete cycle path", async () => {
    const methods = writeMethodsDir(["alpha", "beta"]);
    writeFileSync(join(methods, "alpha.md"), method("alpha", ["beta"]));
    writeFileSync(join(methods, "beta.md"), method("beta", ["alpha"]));
    const extensions = writeExtensionsDir([]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"], []);

    const result = await audit(methods, extensions, workflows);
    expect(result.pass).toBe(false);
    expect(result.diagnostics).toContain("Method dependency cycle: alpha -> beta -> alpha.");
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

  it("passes when an undeclared method is listed as wiring-pending", async () => {
    const methods = writeMethodsDir(["alpha", "beta"]);
    const extensions = writeExtensionsDir([]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"], []);
    const result = await audit(methods, extensions, workflows, new Set(["beta"]));
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails with a stale-allowlist diagnostic when a wiring-pending method gains a declaration", async () => {
    const methods = writeMethodsDir(["alpha"]);
    const extensions = writeExtensionsDir([]);
    const workflows = join(tmp, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeWorkflow("workflows/one.md", ["alpha"], []);
    const result = await audit(methods, extensions, workflows, new Set(["alpha"]));
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some((d) => d.includes("\"alpha\"") && d.includes("WIRING_PENDING")),
    ).toBe(true);
  });
});
