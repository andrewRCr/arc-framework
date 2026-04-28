/**
 * Unit tests for the DEV-RULES domain-rules Clack summary formatter.
 */

import { describe, it, expect } from "vitest";

import { buildDomainRulesSessionInitSummary } from "../../src/commands/constitution.js";
import type { DomainRulesSessionInitResult } from "../../src/commands/constitution.js";

function result(overrides: Partial<DomainRulesSessionInitResult> = {}): DomainRulesSessionInitResult {
  return {
    mode: "session-init",
    rules: [],
    warnings: [],
    ...overrides,
  };
}

describe("buildDomainRulesSessionInitSummary", () => {
  it('renders "No domain rules." when rules and warnings are both empty', () => {
    expect(buildDomainRulesSessionInitSummary(result())).toBe("No domain rules.");
  });

  it("renders a count header and one bullet per rule", () => {
    const summary = buildDomainRulesSessionInitSummary(
      result({
        rules: [
          { path: "p1", domain: "frontend", purpose: "UI standards" },
          { path: "p2", domain: "backend", purpose: "Service rules" },
        ],
      }),
    );
    expect(summary).toContain("2 domain rule(s):");
    expect(summary).toContain("- frontend — UI standards");
    expect(summary).toContain("- backend — Service rules");
  });

  it("appends a Warnings section when warnings are present", () => {
    const summary = buildDomainRulesSessionInitSummary(
      result({
        rules: [{ path: "p", domain: "frontend", purpose: "UI" }],
        warnings: ["DEV-RULES.BACKEND.md: missing `purpose`"],
      }),
    );
    expect(summary).toContain("Warnings:");
    expect(summary).toContain("  - DEV-RULES.BACKEND.md: missing `purpose`");
  });

  it("renders only warnings when rules are empty but warnings exist", () => {
    const summary = buildDomainRulesSessionInitSummary(
      result({ warnings: ["DEV-RULES.X.md: malformed YAML"] }),
    );
    expect(summary).toContain("No domain rules.");
    expect(summary).toContain("Warnings:");
    expect(summary).toContain("DEV-RULES.X.md: malformed YAML");
  });
});
