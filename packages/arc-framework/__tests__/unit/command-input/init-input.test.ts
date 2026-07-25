import { describe, expect, it, vi } from "vitest";

import {
  InitCommandInputSchema,
  resolveInitCommandInput,
} from "../../../src/commands/init-input.js";

const context = (interaction: "allowed" | "forbidden") => ({ interaction }) as const;

describe("init command input", () => {
  it("resolves equivalent supplied and prompted values through one schema", async () => {
    const supplied = await resolveInitCommandInput({
      options: {
        name: "Example",
        pmMode: "arc-in-git",
        tools: "codex,claude",
        team: true,
        identity: "Andrew R. Cr",
      },
      cwd: "/tmp/example",
      context: context("forbidden"),
      resolveIdentity: vi.fn(),
    });
    const prompted = await resolveInitCommandInput({
      options: {},
      cwd: "/tmp/example",
      context: context("allowed"),
      prompt: async () => ({
        projectName: "Example",
        pmMode: "arc-in-git",
        tools: ["codex", "claude"],
        teamMode: true,
      }),
      resolveIdentity: async () => "andrew-r-cr",
    });

    expect(supplied).toMatchObject({ kind: "resolved", value: prompted.kind === "resolved" ? prompted.value : {} });
    expect(InitCommandInputSchema.parse((supplied as { value: unknown }).value)).toMatchObject({
      identity: "andrew-r-cr",
    });
  });

  it("uses only declared no-input defaults and aggregates missing identity", async () => {
    const resolved = await resolveInitCommandInput({
      options: {},
      cwd: "/tmp/example-project",
      context: context("forbidden"),
      resolveIdentity: async () => "andrew",
    });
    expect(resolved).toMatchObject({
      kind: "resolved",
      source: "default",
      value: {
        projectName: "example-project",
        tools: [],
        pmMode: "none",
        teamMode: false,
        identity: "andrew",
      },
    });

    await expect(resolveInitCommandInput({
      options: {},
      cwd: "/tmp/example-project",
      context: context("forbidden"),
      resolveIdentity: async () => null,
    })).resolves.toEqual({
      kind: "unavailable",
      missing: [{ name: "identity", acceptedSyntax: ["--identity <name>"] }],
    });
  });

  it("rejects fresh-only identity on reconfigure before prompt or identity acquisition", async () => {
    const prompt = vi.fn();
    const resolveIdentity = vi.fn();
    const result = await resolveInitCommandInput({
      options: { reconfigure: true, identity: "andrew" },
      cwd: "/tmp/example",
      context: context("allowed"),
      prompt,
      resolveIdentity,
      current: { projectName: "Example", pmMode: "none", teamMode: false },
    });
    expect(result).toMatchObject({ kind: "invalid", issues: [{ path: ["identity"] }] });
    expect(prompt).not.toHaveBeenCalled();
    expect(resolveIdentity).not.toHaveBeenCalled();
  });
});
