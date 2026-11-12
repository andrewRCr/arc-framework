import { describe, expect, it, vi } from "vitest";

import { resolveJoinCommandInput as resolveJoinInput } from "../../../src/commands/join-input.js";

import { runJoinPrompts } from "../../../src/prompts/join-prompts.js";
import { resolveInteractionContext } from "../../../src/lib/command-input/interaction-context.js";

const context = (interaction: "allowed" | "forbidden") => resolveInteractionContext({
  noInput: interaction === "forbidden", machineReadable: false, ci: false,
  promptInputIsTTY: true, promptOutputIsTTY: true, yes: "absent",
});
const resolveJoinCommandInput = (input: Parameters<typeof resolveJoinInput>[0]) => resolveJoinInput({
  ...input,
  prompt: input.prompt ?? (async (supplied) => runJoinPrompts(context(input.context.interaction), {
    suppliedRole: supplied.role, suppliedTools: supplied.tools,
  })),
});

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

  it("uses the prompt callback's acquired values even when interaction is forbidden", async () => {
    expect(await resolveJoinCommandInput({ options: { identity: "andrew" }, context: context("forbidden"),
      prompt: async () => ({ role: "contributor", tools: ["codex"] }), resolveIdentity: vi.fn(),
    })).toMatchObject({ kind: "resolved", value: { role: "contributor", tools: ["codex"] } });
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
    })).resolves.toMatchObject({ kind: "invalid", issues: [{ path: ["identity"] }] });
    expect(prompt).not.toHaveBeenCalled();
  });
});
