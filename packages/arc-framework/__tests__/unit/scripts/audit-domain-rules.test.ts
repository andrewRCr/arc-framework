/**
 * Unit tests for the DEV-RULES domain-rules audit.
 *
 * Covers enumeration (domain files vs. reserved / non-DEV-RULES), per-file
 * frontmatter validation delegation, and the zero-files non-blocking pass.
 * FS-facing behaviors use tmp-dir fixtures; diagnostics are shape-checked
 * via substring assertions.
 *
 * Cross-file `domain` uniqueness is not asserted here — it is structurally
 * guaranteed by the parser's case contract (uppercase filename + lowercase
 * domain with exact match), so no dedicated audit check is needed.
 *
 * Scenarios exercise one `audit()` with shared mkdtemp fixtures because
 * separate one-at-a-time fixtures offer no independent discovery value.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  audit,
  enumerateDomainFiles,
} from "../../../src/scripts/audit-domain-rules.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "audit-domain-rules-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeDomainFile(filename: string, body: string): string {
  const full = join(tmp, filename);
  writeFileSync(full, body);
  return full;
}

function frontmatter(domain: string, purpose: string): string {
  return ["---", `domain: ${domain}`, `purpose: ${purpose}`, "---", ""].join("\n");
}

// --- enumerateDomainFiles ---

describe("enumerateDomainFiles", () => {
  it("returns DEV-RULES.{DOMAIN}.md basenames sorted, excluding reserved filenames", () => {
    writeDomainFile("DEV-RULES.FRONTEND.md", frontmatter("frontend", "UI"));
    writeDomainFile("DEV-RULES.BACKEND.md", frontmatter("backend", "API"));
    writeDomainFile("DEV-RULES.ARC.md", "# no frontmatter\n");
    writeDomainFile("DEV-RULES.PROJECT.md", "# no frontmatter\n");
    expect(enumerateDomainFiles(tmp)).toEqual([
      "DEV-RULES.BACKEND.md",
      "DEV-RULES.FRONTEND.md",
    ]);
  });

  it("excludes non-DEV-RULES files (README.md, unrelated .md)", () => {
    writeDomainFile("README.md", "# Constitution\n");
    writeDomainFile("OTHER.md", "# Not a domain rule\n");
    writeDomainFile("DEV-RULES.FRONTEND.md", frontmatter("frontend", "UI"));
    expect(enumerateDomainFiles(tmp)).toEqual(["DEV-RULES.FRONTEND.md"]);
  });

  it("returns [] when the directory has no domain files", () => {
    expect(enumerateDomainFiles(tmp)).toEqual([]);
  });
});

// --- audit() end-to-end ---

describe("audit", () => {
  it("passes with no diagnostics when the directory has no domain files", () => {
    const result = audit(tmp);
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes when a single valid domain file is present", () => {
    writeDomainFile("DEV-RULES.FRONTEND.md", frontmatter("frontend", "UI standards"));
    const result = audit(tmp);
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("fails with a diagnostic naming the file path + inner error on invalid frontmatter", () => {
    writeDomainFile(
      "DEV-RULES.BACKEND.md",
      ["---", "purpose: missing domain", "---", ""].join("\n"),
    );
    const result = audit(tmp);
    expect(result.pass).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.includes("DEV-RULES.BACKEND.md") && d.includes("`domain`"),
      ),
    ).toBe(true);
  });

  it("does not inspect reserved DEV-RULES.ARC.md / DEV-RULES.PROJECT.md", () => {
    // Reserved files carry no frontmatter; the audit must ignore them rather
    // than surface missing-frontmatter diagnostics.
    writeDomainFile("DEV-RULES.ARC.md", "# no frontmatter\n");
    writeDomainFile("DEV-RULES.PROJECT.md", "# no frontmatter\n");
    const result = audit(tmp);
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
