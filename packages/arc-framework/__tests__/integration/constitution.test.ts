/**
 * Integration tests for the DEV-RULES domain-rules probe.
 *
 * Builds a synthetic `.arc/system/rules/` tree in a temp
 * directory and exercises `runDomainRulesSessionInitStatus` against it
 * — covering empty directories, reserved-name skipping, alphabetical
 * ordering, malformed-frontmatter warnings, and non-`.md` exclusion.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runDomainRulesSessionInitStatus } from "../../src/commands/constitution.js";

interface Fixture {
  root: string;
  dir: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-constitution-"));
  const dir = join(root, ".arc", "system", "rules");
  await mkdir(dir, { recursive: true });
  return { root, dir };
}

function domainFile(domain: string, purpose: string): string {
  return [
    "---",
    `domain: ${domain}`,
    `purpose: ${purpose}`,
    "---",
    "",
    `# Development Rules (${domain})`,
    "",
  ].join("\n");
}

async function writeDomain(dir: string, basename: string, domain: string, purpose: string): Promise<void> {
  await writeFile(join(dir, `${basename}.md`), domainFile(domain, purpose));
}

describe("runDomainRulesSessionInitStatus", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns empty rules and warnings for an empty constitution directory", async () => {
    const result = await runDomainRulesSessionInitStatus({ cwd: fixture.root });
    expect(result.mode).toBe("session-init");
    expect(result.rules).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("silently skips DEV-RULES.ARC.md and DEV-RULES.PROJECT.md when they carry no frontmatter", async () => {
    await writeFile(join(fixture.dir, "DEV-RULES.ARC.md"), "# Development Rules (ARC)\n");
    await writeFile(join(fixture.dir, "DEV-RULES.PROJECT.md"), "# Development Rules (Project)\n");
    const result = await runDomainRulesSessionInitStatus({ cwd: fixture.root });
    expect(result.rules).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("enumerates a single valid domain file with path, domain, and purpose", async () => {
    await writeDomain(fixture.dir, "DEV-RULES.FRONTEND", "frontend", "UI component standards");
    const result = await runDomainRulesSessionInitStatus({ cwd: fixture.root });
    expect(result.rules).toEqual([
      {
        path: ".arc/system/rules/DEV-RULES.FRONTEND.md",
        domain: "frontend",
        purpose: "UI component standards",
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("returns multiple valid domain files sorted alphabetically by filename", async () => {
    await writeDomain(fixture.dir, "DEV-RULES.SECURITY", "security", "Threat model rules");
    await writeDomain(fixture.dir, "DEV-RULES.FRONTEND", "frontend", "UI standards");
    await writeDomain(fixture.dir, "DEV-RULES.BACKEND", "backend", "Service rules");
    const result = await runDomainRulesSessionInitStatus({ cwd: fixture.root });
    expect(result.rules.map((r) => r.domain)).toEqual(["backend", "frontend", "security"]);
  });

  it("records a warning and excludes the file when frontmatter is malformed", async () => {
    await writeDomain(fixture.dir, "DEV-RULES.FRONTEND", "frontend", "UI standards");
    await writeFile(
      join(fixture.dir, "DEV-RULES.BACKEND.md"),
      ["---", "domain: backend", "---", ""].join("\n"),
    );
    const result = await runDomainRulesSessionInitStatus({ cwd: fixture.root });
    expect(result.rules.map((r) => r.domain)).toEqual(["frontend"]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("DEV-RULES.BACKEND.md");
    expect(result.warnings[0]).toContain("`purpose`");
  });

  it("handles mixed directories — ARC/PROJECT silently skipped, valid enumerated, malformed warned", async () => {
    await writeFile(join(fixture.dir, "DEV-RULES.ARC.md"), "# ARC\n");
    await writeFile(join(fixture.dir, "DEV-RULES.PROJECT.md"), "# PROJECT\n");
    await writeDomain(fixture.dir, "DEV-RULES.FRONTEND", "frontend", "UI standards");
    await writeFile(
      join(fixture.dir, "DEV-RULES.BACKEND.md"),
      ["---", "domain: wrong-name", "purpose: Service rules", "---", ""].join("\n"),
    );
    const result = await runDomainRulesSessionInitStatus({ cwd: fixture.root });
    expect(result.rules.length).toBe(1);
    expect(result.rules[0]?.domain).toBe("frontend");
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("DEV-RULES.BACKEND.md");
  });

  it("excludes README.md from the constitution directory", async () => {
    await writeDomain(fixture.dir, "DEV-RULES.FRONTEND", "frontend", "UI standards");
    await writeFile(join(fixture.dir, "README.md"), "# Constitution directory\n");
    const result = await runDomainRulesSessionInitStatus({ cwd: fixture.root });
    expect(result.rules.map((r) => r.domain)).toEqual(["frontend"]);
    expect(result.warnings).toEqual([]);
  });

  it("excludes non-`.md` files", async () => {
    await writeDomain(fixture.dir, "DEV-RULES.FRONTEND", "frontend", "UI standards");
    await writeFile(join(fixture.dir, "DEV-RULES.FRONTEND.yml"), "domain: frontend\n");
    await writeFile(join(fixture.dir, "notes.txt"), "scratch\n");
    const result = await runDomainRulesSessionInitStatus({ cwd: fixture.root });
    expect(result.rules.map((r) => r.domain)).toEqual(["frontend"]);
  });

  it("propagates missing-directory errors (matches extensions probe precedent)", async () => {
    await rm(fixture.dir, { recursive: true });
    await expect(runDomainRulesSessionInitStatus({ cwd: fixture.root })).rejects.toThrow();
  });
});
