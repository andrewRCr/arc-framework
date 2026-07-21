import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  acquirePromptInput,
  presentWithInteraction,
} from "../../../src/lib/command-input/index.js";

const context = (interaction: "allowed" | "forbidden") => ({
  interaction,
  subprocess: { presenters: interaction },
}) as const;

describe("interaction capabilities", () => {
  it("refuses prompt acquisition without invoking the prompt when interaction is forbidden", async () => {
    const prompt = vi.fn(async () => "value");
    await expect(acquirePromptInput(
      context("forbidden"),
      z.string(),
      { name: "name", acceptedSyntax: ["--name <name>"] },
      prompt,
    )).resolves.toEqual({
      kind: "unavailable",
      missing: [{ name: "name", acceptedSyntax: ["--name <name>"] }],
    });
    expect(prompt).not.toHaveBeenCalled();
  });

  it("normalizes prompt cancellation and validates answers through the supplied schema", async () => {
    await expect(acquirePromptInput(
      context("allowed"),
      z.string(),
      { name: "name", acceptedSyntax: [] },
      async () => Symbol("cancelled"),
    )).resolves.toEqual({ kind: "cancelled" });
    await expect(acquirePromptInput(
      context("allowed"),
      z.string().min(2),
      { name: "name", acceptedSyntax: [] },
      async () => "x",
    )).resolves.toMatchObject({ kind: "invalid" });
  });

  it("uses paged presentation only when presenters are allowed", async () => {
    const direct = vi.fn(async () => undefined);
    const paged = vi.fn(async () => undefined);
    await presentWithInteraction(context("allowed"), "content", { direct, paged });
    expect(paged).toHaveBeenCalledWith("content");
    expect(direct).not.toHaveBeenCalled();

    await presentWithInteraction(context("forbidden"), "direct", { direct, paged });
    expect(direct).toHaveBeenCalledWith("direct");
  });
});
