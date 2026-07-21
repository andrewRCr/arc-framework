import { describe, expect, it } from "vitest";

import {
  resolveCommandInteractionContext,
  resolveInteractionContext,
  withInteractionContext,
  type InteractionSignals,
} from "../../../src/lib/command-input/index.js";

const signals = (overrides: Partial<InteractionSignals> = {}): InteractionSignals => ({
  noInput: false,
  machineReadable: false,
  ci: false,
  promptInputIsTTY: true,
  promptOutputIsTTY: true,
  yes: "absent",
  ...overrides,
});

describe("interaction context", () => {
  it("allows prompts and asks for confirmation for an ordinary interactive invocation", () => {
    expect(resolveInteractionContext(signals())).toMatchObject({
      interaction: "allowed",
      confirmation: "ask",
      machineReadable: false,
      subprocess: { terminalPrompts: "allowed", presenters: "allowed", ambientStdin: "inherit" },
    });
  });

  it.each([
    { noInput: true },
    { machineReadable: true },
    { ci: true },
    { promptInputIsTTY: false },
    { promptOutputIsTTY: false },
  ])("forbids interaction without accepting protected effects: %o", (override) => {
    expect(resolveInteractionContext(signals(override))).toMatchObject({
      interaction: "forbidden",
      confirmation: "ask",
      subprocess: { terminalPrompts: "forbidden", presenters: "forbidden", ambientStdin: "closed" },
    });
  });

  it("keeps compatibility and authority-bearing yes semantics distinct", () => {
    expect(resolveInteractionContext(signals({ yes: "compatibility" }))).toMatchObject({
      interaction: "forbidden",
      confirmation: "ask",
    });
    expect(resolveInteractionContext(signals({ yes: "authority" }))).toMatchObject({
      interaction: "forbidden",
      confirmation: "accept",
    });
  });

  it("reads inherited no-input and declared local machine/authority options from the action command", () => {
    const command = {
      opts: () => ({ json: true, yes: true }),
      optsWithGlobals: () => ({ json: true, yes: true, noInput: true }),
    };

    expect(resolveCommandInteractionContext(command, {
      machineReadable: (options) => options.json === true,
      yes: "authority",
      environment: {
        ci: false,
        promptInputIsTTY: true,
        promptOutputIsTTY: true,
      },
    })).toMatchObject({
      interaction: "forbidden",
      confirmation: "accept",
      machineReadable: true,
    });
  });

  it("constructs context once at the action adapter before invoking command code", () => {
    const command = {
      opts: () => ({}),
      optsWithGlobals: () => ({ noInput: true }),
    };
    const action = withInteractionContext({}, (context, value: string) => ({
      value,
      interaction: context.interaction,
    }));

    expect(action("payload", command)).toEqual({ value: "payload", interaction: "forbidden" });
  });
});
