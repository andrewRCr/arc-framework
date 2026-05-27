/**
 * Unit tests for the cold-start spec-input parser.
 *
 * The parser makes two *closed* assignments — an ARC spec artifact
 * (`draft-`/`spec-`) → Design, an issue reference → Origin — and passes
 * everything else through (a `document` to read or a free-text `description`)
 * for the agent to assess interactively. Outcomes are no-throw discriminated;
 * only empty input fails.
 */

import { describe, it, expect } from "vitest";

import { parseSpecInput } from "../../../src/lib/active/spec-input-parser.js";

describe("parseSpecInput — ARC spec artifacts → Design (closed)", () => {
  it("classifies a spec- file as arc-spec routed to Design", () => {
    const r = parseSpecInput("spec-payments.md");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ kind: "arc-spec", design: "spec-payments.md" });
  });

  it("classifies a draft- file as arc-spec too", () => {
    const r = parseSpecInput("draft-onboarding.md");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ kind: "arc-spec", design: "draft-onboarding.md" });
  });

  it("matches the ARC spec prefix on the basename of a nested path", () => {
    const r = parseSpecInput("./.arc/backlog/planned/foo/draft-foo.md");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ kind: "arc-spec", design: "./.arc/backlog/planned/foo/draft-foo.md" });
  });
});

describe("parseSpecInput — issue references → Origin (closed)", () => {
  it("classifies a bare #n and an owner/repo#n reference", () => {
    for (const ref of ["#42", "acme/widget#42"]) {
      const r = parseSpecInput(ref);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toEqual({ kind: "issue", origin: ref });
    }
  });

  it("classifies an issue-tracker URL as an issue (not a plain document)", () => {
    const r = parseSpecInput("https://github.com/acme/widget/issues/42");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ kind: "issue", origin: "https://github.com/acme/widget/issues/42" });
  });
});

describe("parseSpecInput — documents → pass-through (no meta field)", () => {
  it("passes a non-ARC local file through as a document", () => {
    const r = parseSpecInput("./docs/requirements.md");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ kind: "document", document: "./docs/requirements.md" });
  });

  it("passes a bare prefixless filename through as a document", () => {
    const r = parseSpecInput("whatever.md");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ kind: "document", document: "whatever.md" });
  });

  it("passes a non-issue URL through as a document", () => {
    const r = parseSpecInput("https://notion.so/feature-brief");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ kind: "document", document: "https://notion.so/feature-brief" });
  });

  it("passes non-spec ARC artifacts (tasks-/meta-) through as documents, not Design", () => {
    for (const ref of ["tasks-onboarding.md", "meta-onboarding.md", "notes-onboarding.md"]) {
      const r = parseSpecInput(ref);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toEqual({ kind: "document", document: ref });
    }
  });

  it("passes a degenerate hostless URL through as a document (empty-only failure surface)", () => {
    const r = parseSpecInput("https://");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ kind: "document", document: "https://" });
  });
});

describe("parseSpecInput — free text → description (no meta field)", () => {
  it("classifies prose with whitespace as a description", () => {
    const r = parseSpecInput("Add a dark-mode toggle to the settings panel");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ kind: "description", description: "Add a dark-mode toggle to the settings panel" });
  });

  it("classifies a prefixless bare slug (no separator, no extension) as a description", () => {
    const r = parseSpecInput("refactor-auth");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ kind: "description", description: "refactor-auth" });
  });

  it("trims surrounding whitespace from the description", () => {
    const r = parseSpecInput("  refactor the auth middleware  ");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ kind: "description", description: "refactor the auth middleware" });
  });
});

describe("parseSpecInput — empty input → no-throw failure", () => {
  it("returns a failure outcome for empty or whitespace-only input", () => {
    for (const raw of ["", "   ", "\t\n"]) {
      const r = parseSpecInput(raw);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toMatch(/empty/i);
    }
  });
});
