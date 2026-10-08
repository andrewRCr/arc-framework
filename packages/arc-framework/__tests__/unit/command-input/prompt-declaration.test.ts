import { describe, expect, it } from "vitest";
import {
  CommandInputSiteSchema,
  CommandInputDeclarationError,
  defineCommandInputDeclaration,
  type CommandInputSite,
  declarePromptSite,
  type PromptSite,
} from "../../../src/lib/command-input/declaration.js";

const policy = {
  acquisition: "courtesy-confirmation", schemaOwnership: "none", cancellation: "stop",
  automation: { noInput: "proceed" }, mutationBoundary: "wait for the answer", subprocess: "none",
} as const;

describe("branded prompt declarations", () => {
  it("produces a normalized, immutable site carrying its question form", () => {
    const site: PromptSite<"confirm"> = declarePromptSite("example.confirm", "confirm",
      { file: "handlers/example.ts", symbol: "exampleConfirmSite" }, policy);
    expect(site).toMatchObject({ id: "example.confirm", origin: "prompt", form: "confirm",
      source: { file: "handlers/example.ts", symbol: "exampleConfirmSite" },
      automation: { noInput: "proceed", flags: [], acceptedSyntax: [] } });
    expect(Object.isFrozen(site)).toBe(true);
    expect(Object.isFrozen(site.source)).toBe(true);
    expect(Object.isFrozen(site.automation)).toBe(true);
    expect(Object.isFrozen(site.automation.acceptedSyntax)).toBe(true);
    const structural = { ...CommandInputSiteSchema.parse(site), origin: "prompt" as const, form: "confirm" as const,
      automation: { ...site.automation } };
    // @ts-expect-error A structural declaration cannot manufacture the private prompt brand.
    const unbranded: PromptSite<"confirm"> = structural;
    expect(unbranded.id).toBe(site.id);
  });
});

describe("executable prompt policies", () => {
  const site = (): CommandInputSite => ({
    ...policy, id: "example.confirm", origin: "prompt", form: "confirm",
    source: { file: "handlers/example.ts", symbol: "exampleConfirmSite" },
  });
  it.each([
    { label: "unsupported policy", changes: { automation: { noInput: "same" } } },
    { label: "explicit input without syntax", changes: { automation: { noInput: "require-explicit" } } },
    { label: "authority without syntax", changes: { automation: { noInput: "require-authority" } } },
    { label: "proceed on text", changes: { form: "text" } },
    { label: "authority on select", changes: { form: "select", automation: { noInput: "require-authority", acceptedSyntax: ["--yes"] } } },
    { label: "skip cancellation", changes: { cancellation: "skip" } },
    { label: "inapplicable cancellation", changes: { cancellation: "not-applicable" } },
    { label: "missing form", changes: { form: undefined } },
    { label: "form on a declaration site", changes: { origin: "declaration" } },
    { label: "form on a syntax site", changes: { origin: "syntax" } },
  ] satisfies readonly { label: string; changes: Partial<CommandInputSite> }[])("refuses $label", ({ changes }) => {
    try {
      defineCommandInputDeclaration({ commandPath: "example", sites: [{ ...site(), ...changes }] });
      expect.fail("Expected contradictory prompt policy refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandInputDeclarationError);
      expect(error).toMatchObject({ code: "command-input.declaration.contradictory" });
    }
  });
  it("keeps option authority without syntax valid", () => {
    const option: CommandInputSite = { ...site(), origin: "syntax", form: undefined,
      automation: { noInput: "require-authority" } };
    expect(defineCommandInputDeclaration({ commandPath: "example", sites: [option] }).sites[0])
      .toMatchObject({ origin: "syntax", automation: { noInput: "require-authority", acceptedSyntax: [] } });
  });
});
