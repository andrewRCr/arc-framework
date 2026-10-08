import { describe, expect, it, vi } from "vitest";

import {
  InitCommandInputSchema,
  resolveInitCommandInput as resolveInitInput,
} from "../../../src/commands/init-input.js";

import { runInitPrompts } from "../../../src/prompts/init-prompts.js";
import { resolveInteractionContext } from "../../../src/lib/command-input/interaction-context.js";

const context = (interaction: "allowed" | "forbidden") => resolveInteractionContext({
  noInput: interaction === "forbidden", machineReadable: false, ci: false,
  promptInputIsTTY: true, promptOutputIsTTY: true, yes: "absent",
});
const resolveInitCommandInput = (input: Parameters<typeof resolveInitInput>[0]) => resolveInitInput({
  ...input,
  prompt: input.prompt ?? (async (supplied) => {
    const answer = await runInitPrompts(input.cwd, context(input.context.interaction), {
      name: supplied.projectName, tools: supplied.tools, pmMode: supplied.pmMode, teamMode: supplied.teamMode,
    });
    return answer === null ? null : { projectName: answer.project_name, tools: answer.tools,
      pmMode: answer.pm_mode, teamMode: answer.team_mode };
  }),
});

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

  it("uses the prompt callback's acquired values even when interaction is forbidden", async () => {
    expect(await resolveInitCommandInput({ options: {}, cwd: "/tmp/example", context: context("forbidden"),
      prompt: async () => ({ projectName: "Acquired", tools: ["codex"], pmMode: "external", teamMode: true }),
      resolveIdentity: async () => "andrew",
    })).toMatchObject({ kind: "resolved", value: { projectName: "Acquired", tools: ["codex"], pmMode: "external", teamMode: true } });
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
    });
    expect(result).toMatchObject({ kind: "invalid", issues: [{ path: ["identity"] }] });
    expect(prompt).not.toHaveBeenCalled();
    expect(resolveIdentity).not.toHaveBeenCalled();
  });
});
