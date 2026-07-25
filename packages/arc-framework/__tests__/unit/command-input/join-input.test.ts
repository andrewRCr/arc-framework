import { describe, expect, it, vi } from "vitest";

import { resolveJoinCommandInput } from "../../../src/commands/join-input.js";

const context = (interaction: "allowed" | "forbidden") => ({ interaction }) as const;

describe("join command input", () => {
  it("normalizes supplied identity and applies safe no-input defaults", async () => {
    await expect(resolveJoinCommandInput({
      options: { identity: "Andrew R. Cr" },
      context: context("forbidden"),
      resolveIdentity: vi.fn(),
    })).resolves.toMatchObject({
      kind: "resolved",
      value: { role: "maintainer", tools: [], identity: "andrew-r-cr" },
    });
  });

  it("requires identity without inventing one and rejects it during reconfigure", async () => {
    await expect(resolveJoinCommandInput({
      options: {},
      context: context("forbidden"),
      resolveIdentity: async () => null,
    })).resolves.toMatchObject({ kind: "unavailable", missing: [{ name: "identity" }] });

    const prompt = vi.fn();
    await expect(resolveJoinCommandInput({
      options: { reconfigure: true, identity: "andrew" },
      context: context("allowed"),
      prompt,
      resolveIdentity: vi.fn(),
      current: { role: "maintainer", tools: [] },
    })).resolves.toMatchObject({ kind: "invalid", issues: [{ path: ["identity"] }] });
    expect(prompt).not.toHaveBeenCalled();
  });
});
