/** Unit tests for Context trailer and repository-state policy. */

import { describe, expect, it, vi } from "vitest";
import {
  createCommitCheckContext,
  readCommitCheckConfiguration,
  validateCommitMessage,
} from "../../../src/lib/commit-check/index.js";
import type { CommitCheckArtifactResolution } from "../../../src/lib/commit-check/index.js";

function message(context?: string): string {
  return ["feat(test): validate footer policy", "", "Body.", context ? "" : null, context ? `Context: ${context}` : null]
    .filter((line): line is string => line !== null)
    .join("\n");
}

async function findings(
  source: string,
  options: {
    config?: Readonly<Record<string, string>>;
    artifact?: CommitCheckArtifactResolution;
    role?: string | null;
  } = {},
) {
  const context = createCommitCheckContext({
    configuration: readCommitCheckConfiguration(options.config ?? {}),
    mergeInProgress: false,
    role: options.role,
    resolveArtifact: vi.fn().mockResolvedValue(options.artifact ?? "found"),
  });
  const outcome = await validateCommitMessage(source, context);
  if (outcome.kind !== "validated") throw new Error("expected validated outcome");
  return outcome.findings;
}

describe("Context footer modes", () => {
  it("rejects a missing required footer", async () => {
    await expect(findings(message())).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "footer.missing", severity: "error" })]),
    );
  });

  it("warns for a missing recommended footer", async () => {
    await expect(
      findings(message(), { config: { "commit.context_footer": "recommended" } }),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "footer.missing", severity: "warning" })]),
    );
  });

  it("disables footer opinions without disabling subject or body policy", async () => {
    const result = await findings("invalid", { config: { "commit.context_footer": "disabled" } });

    expect(result.some(({ code }) => code.startsWith("footer."))).toBe(false);
    expect(result.some(({ code }) => code.startsWith("subject."))).toBe(true);
  });

  it("matches a custom context pattern against logical lines", async () => {
    const config = {
      "commit.context_footer": "custom",
      "commit.context_pattern": "^Trace: ticket-[0-9]+$",
    };
    await expect(
      findings("feat(test): validate footer policy\n\nTrace: ticket-12", { config }),
    ).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "footer.custom-mismatch" })]),
    );
    await expect(findings(message(), { config })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "footer.custom-mismatch" })]),
    );
  });
});

describe("Context footer families", () => {
  it.each([
    "tasks-example.md (Task 1.2)",
    "tasks-example.md (Task 1.2.a)",
    "tasks-example.md (Tasks 1.2-1.4)",
    "tasks-example.md (Tasks 1.2.a-d)",
    "tasks-example.md (Tasks 1.2, 3.4.a, 5.1.b-d)",
    "tasks-example.md (Task 1.2; planning)",
    "tasks-example.md (Tasks 1.2, 3.4; maintenance)",
    "tasks-example.md (incidental during code review)",
    "tasks-example.md (planning)",
    "tasks-example.md (maintenance)",
    "tasks-example.md (code review)",
    "draft-example.md (planning)",
    "spec-example.md (code review)",
    "meta-example.md (handoff)",
    "meta-example.md (activation)",
    "meta-example.md (integration)",
    "meta-example.md (archival)",
    "meta-example.md (deactivation)",
    "meta-example.md (maintenance)",
    "meta-example.md (incidental during repair)",
    "standalone (maintenance)",
    "standalone (planning)",
    "standalone (documentation)",
    "standalone (refactor)",
    "integration (squash-merge cleanup)",
    "contribution (fix typo in README)",
  ])("accepts %s", async (context) => {
    const result = await findings(message(context));
    expect(result.filter(({ code }) => code === "footer.invalid")).toEqual([]);
  });

  it("rejects an invalid footer with family-specific suggestions", async () => {
    const result = await findings(message("tasks-example.md (handoff)"));

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "footer.invalid",
          detail: expect.objectContaining({ suggestions: expect.arrayContaining([expect.stringContaining("task")]) }),
        }),
      ]),
    );
  });

  it.each([
    "tasks-example.md (content)",
    "tasks-example.md (incidental - discovered during Task 1.2)",
    "draft-example.md (maintenance)",
    "meta-example.md (planning)",
    "planning (no associated task list)",
    "maintenance (atomic / no associated task list)",
    "atomic-example.md",
    "standalone (content)",
  ])("retains rejection of retired footer %s", async (context) => {
    const result = await findings(message(context));
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ code: "footer.invalid" })]));
  });
});

describe("artifact and contributor advisories", () => {
  it.each([
    ["not-found", "footer.artifact-not-found"],
    ["unresolvable", "footer.artifact-unresolvable"],
  ] as const)("maps %s to warning %s", async (artifact, code) => {
    const result = await findings(message("spec-example.md (planning)"), { artifact });

    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ code, severity: "warning" })]));
  });

  it("advises contributors without rejecting a valid non-contribution footer", async () => {
    const result = await findings(message("standalone (maintenance)"), { role: "contributor" });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "footer.contributor-advisory", severity: "warning" }),
      ]),
    );
    expect(result.some(({ severity }) => severity === "error")).toBe(false);
  });
});
