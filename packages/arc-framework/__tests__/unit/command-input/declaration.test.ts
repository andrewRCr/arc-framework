import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CommandInputDeclarationError,
  defineCommandInputDeclaration,
  defineCommandInputDeclarations,
  type AcquisitionClass,
  type CommandInputDeclaration,
} from "../../../src/lib/command-input/index.js";

const declaration = (): CommandInputDeclaration => ({
  commandPath: "example create",
  aliases: ["example add"],
  sites: [
    {
      id: "name",
      source: {
        file: "src/commands/example.ts",
        symbol: "exampleCreateInputDeclaration",
      },
      origin: "declaration",
      acquisition: "handler-required",
      schemaOwnership: "owned",
      schemaField: "name",
      cancellation: "stop",
      automation: {
        noInput: "require-explicit",
        flags: [],
        acceptedSyntax: ["<name>", "--name <name>"],
      },
      mutationBoundary: "create waits for a resolved name",
      subprocess: "none",
    },
  ],
});

describe("command-input declarations", () => {
  it("preserves the complete policy vocabulary with schema-inferred types", () => {
    expectTypeOf<AcquisitionClass>().toEqualTypeOf<
      | "supplied"
      | "derived"
      | "parser-required"
      | "optional"
      | "safe-default"
      | "handler-required"
      | "courtesy-confirmation"
      | "protected-confirmation"
      | "interactive-only-override"
      | "required-evidence"
      | "explicit-stdin"
      | "opaque-passthrough"
      | "machine-mode"
      | "presenter"
      | "subprocess"
    >();

    const result = defineCommandInputDeclaration(declaration());

    expect(result).toEqual(declaration());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.sites)).toBe(true);
    expect(Object.isFrozen(result.sites[0])).toBe(true);
  });

  it("deep-freezes an interaction selector after validation", () => {
    const value = declaration();
    value.sites[0] = {
      ...value.sites[0]!,
      source: {
        file: "src/commands/example.ts",
        interaction: { kind: "prompt", callee: "p.text", occurrence: 1 },
      },
    };

    const result = defineCommandInputDeclaration(value);

    expect(Object.isFrozen(result.sites[0]?.source.interaction)).toBe(true);
  });

  it.each([
    {
      label: "safe default without a default source",
      mutate: (value: CommandInputDeclaration) => {
        value.sites[0] = { ...value.sites[0]!, acquisition: "safe-default" };
      },
    },
    {
      label: "derived input without a derivation source",
      mutate: (value: CommandInputDeclaration) => {
        value.sites[0] = { ...value.sites[0]!, acquisition: "derived" };
      },
    },
    {
      label: "opaque input claiming schema ownership",
      mutate: (value: CommandInputDeclaration) => {
        value.sites[0] = { ...value.sites[0]!, acquisition: "opaque-passthrough" };
      },
    },
    {
      label: "protected confirmation that proceeds without authority",
      mutate: (value: CommandInputDeclaration) => {
        value.sites[0] = {
          ...value.sites[0]!,
          acquisition: "protected-confirmation",
          schemaOwnership: "none",
          automation: { noInput: "proceed", acceptedSyntax: [] },
        };
      },
    },
  ])("rejects contradictory policy: $label", ({ mutate }) => {
    const value = declaration();
    mutate(value);

    expect(() => defineCommandInputDeclaration(value)).toThrow(CommandInputDeclarationError);
  });

  it("rejects duplicate canonical paths, site identities, aliases, and dangling aliases", () => {
    const duplicateSite = declaration();
    duplicateSite.sites = [...duplicateSite.sites, { ...duplicateSite.sites[0]! }];
    expect(() => defineCommandInputDeclaration(duplicateSite)).toThrow(/duplicate site/u);

    expect(() => defineCommandInputDeclarations([declaration(), declaration()])).toThrow(/canonical path/u);

    const aliasCollision = declaration();
    aliasCollision.commandPath = "example add";
    aliasCollision.aliases = [];
    expect(() => defineCommandInputDeclarations([declaration(), aliasCollision])).toThrow(/alias/u);

    const dangling = declaration();
    dangling.aliases = [];
    dangling.aliasOf = "example missing";
    expect(() => defineCommandInputDeclarations([dangling])).toThrow(/Dangling alias/u);
  });

  it("returns declarations in deterministic canonical-path order", () => {
    const second = declaration();
    second.commandPath = "zeta";
    second.aliases = [];
    const first = declaration();
    first.commandPath = "alpha";
    first.aliases = [];

    expect(defineCommandInputDeclarations([second, first]).map((entry) => entry.commandPath))
      .toEqual(["alpha", "zeta"]);
  });
});
