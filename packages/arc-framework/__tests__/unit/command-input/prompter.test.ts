import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { declarePromptSite, type PromptForm } from "../../../src/lib/command-input/declaration.js";
import { resolveInteractionContext } from "../../../src/lib/command-input/interaction-context.js";
import { prompt, type PromptRenderer } from "../../../src/lib/command-input/prompter.js";

const context = (interaction: "allowed" | "forbidden", accept = false) => resolveInteractionContext({
  noInput: interaction === "forbidden", machineReadable: false, ci: false,
  promptInputIsTTY: true, promptOutputIsTTY: true, yes: accept ? "authority" : "absent",
});
const site = <Form extends PromptForm>(form: Form, kind: "use-default" | "require-explicit" | "require-authority" | "proceed" | "refuse",
  cancellation: "stop" | "safe-default" = "stop") => declarePromptSite("example.question", form,
  { file: "handlers/example.ts", symbol: "exampleQuestion" }, {
    acquisition: "optional", schemaOwnership: "none", cancellation,
    automation: { noInput: kind, acceptedSyntax: ["--answer <value>"] },
    mutationBoundary: "wait for the answer", subprocess: "none",
  });
const forbiddenRenderer: PromptRenderer = {
  confirm: async () => { throw new Error("Unexpected rendering"); },
  text: async () => { throw new Error("Unexpected rendering"); },
  select: async () => { throw new Error("Unexpected rendering"); },
  multiselect: async () => { throw new Error("Unexpected rendering"); },
};
const cancelledRenderer: PromptRenderer = {
  confirm: async () => ({ kind: "cancelled" }), text: async () => ({ kind: "cancelled" }),
  select: async () => ({ kind: "cancelled" }), multiselect: async () => ({ kind: "cancelled" }),
};
const question = { message: "Continue?" };

describe("declaration-bound prompt outcomes", () => {
  it.each(["allowed", "forbidden"] as const)("keeps an explicit false answer in %s interaction", async (interaction) => {
    const answer = await prompt(site("confirm", "refuse"), context(interaction),
      { ...question, explicitAnswer: false }, forbiddenRenderer);
    expect(answer).toEqual({ kind: "answered", value: false });
    expectTypeOf(answer).toEqualTypeOf<import("../../../src/lib/command-input/prompter.js").PromptOutcome<boolean>>();
  });
  it("renders an allowed question and returns the renderer's answer", async () => {
    const renderer: PromptRenderer = { ...forbiddenRenderer, confirm: async () => ({ kind: "answered", value: false }) };
    expect(await prompt(site("confirm", "proceed"), context("allowed"), question, renderer))
      .toEqual({ kind: "answered", value: false });
  });
  it("uses a runtime default, including an empty text answer, when interaction is forbidden", async () => {
    expect(await prompt(site("text", "use-default"), context("forbidden"),
      { message: "Name?", runtimeDefault: "" }, forbiddenRenderer)).toEqual({ kind: "answered", value: "" });
  });
  it.each(["use-default", "require-explicit", "require-authority"] as const)("refuses missing %s input with its declared syntax", async (kind) => {
    expect(await prompt(site("confirm", kind), context("forbidden"), question, forbiddenRenderer))
      .toEqual({ kind: "refused", acceptedSyntax: ["--answer <value>"] });
  });
  it("accepts explicit confirmation authority when forbidden", async () => {
    expect(await prompt(site("confirm", "require-authority"), context("forbidden", true), question, forbiddenRenderer))
      .toEqual({ kind: "answered", value: true });
  });
  it("proceeds without rendering when forbidden", async () => {
    expect(await prompt(site("confirm", "proceed"), context("forbidden"), question, forbiddenRenderer))
      .toEqual({ kind: "answered", value: true });
  });
  it("refuses without syntax even with affirmative authority", async () => {
    expect(await prompt(site("confirm", "refuse"), context("forbidden", true), question, forbiddenRenderer))
      .toEqual({ kind: "refused", acceptedSyntax: [] });
  });
  it("returns cancellation under stop", async () => {
    expect(await prompt(site("confirm", "proceed"), context("allowed"), question, cancelledRenderer))
      .toEqual({ kind: "cancelled" });
  });
  it("answers the safe default on cancellation, including an empty multiselection", async () => {
    const answer = await prompt(site("multiselect", "use-default", "safe-default"), context("allowed"),
      { message: "Tools?", options: [{ value: "tool", label: "Tool" }], runtimeDefault: [] }, cancelledRenderer);
    expect(answer).toEqual({ kind: "answered", value: [] });
  });
  it("returns cancellation when its safe default is absent", async () => {
    expect(await prompt(site("text", "use-default", "safe-default"), context("allowed"),
      { message: "Name?" }, cancelledRenderer)).toEqual({ kind: "cancelled" });
  });
  it("renders text, selection and multiselection with their answer types", async () => {
    const renderer: PromptRenderer = { ...forbiddenRenderer,
      text: async () => ({ kind: "answered", value: "name" }),
      select: async (_context, values) => ({ kind: "answered", value: values.options[0]!.value }),
      multiselect: async (_context, values) => ({ kind: "answered", value: values.options.map((option) => option.value) }),
    };
    const text = await prompt(site("text", "require-explicit"), context("allowed"), { message: "Name?" }, renderer);
    const select = await prompt(site("select", "require-explicit"), context("allowed"),
      { message: "Count?", options: [{ value: 2, label: "Two" }] }, renderer);
    const multi = await prompt(site("multiselect", "use-default"), context("allowed"),
      { message: "Counts?", options: [{ value: 2, label: "Two" }] }, renderer);
    expect(text).toEqual({ kind: "answered", value: "name" });
    expect(select).toEqual({ kind: "answered", value: 2 });
    expect(multi).toEqual({ kind: "answered", value: [2] });
    expectTypeOf(text).toEqualTypeOf<import("../../../src/lib/command-input/prompter.js").PromptOutcome<string>>();
    expectTypeOf(select).toEqualTypeOf<import("../../../src/lib/command-input/prompter.js").PromptOutcome<number>>();
    expectTypeOf(multi).toEqualTypeOf<import("../../../src/lib/command-input/prompter.js").PromptOutcome<number[]>>();
  });
  it("leaves output to its caller", async () => {
    let output = "";
    const writes = [vi.spyOn(process.stdout, "write"), vi.spyOn(process.stderr, "write")];
    for (const write of writes) write.mockImplementation((chunk) => { output += String(chunk); return true; });
    try {
      const result = await prompt(site("confirm", "refuse"), context("forbidden", true), question, forbiddenRenderer);
      expect(result.kind).toBe("refused");
      expect(output).toBe("");
    } finally { for (const write of writes) write.mockRestore(); }
  });
  it("leaves exit status to its caller", async () => {
    const status = process.exitCode;
    try {
      const result = await prompt(site("confirm", "refuse"), context("forbidden", true), question, forbiddenRenderer);
      expect(result.kind).toBe("refused");
      expect(process.exitCode).toBe(status);
    } finally { process.exitCode = status; }
  });
});
