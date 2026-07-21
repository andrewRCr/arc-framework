import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildRepositoryCommandInputInventory,
  renderCommandInputInventory,
} from "../../../src/lib/command-input/repository-inventory.js";
import { NO_INPUT_MATRIX } from "../../fixtures/command-input/no-input-matrix.js";
import { commandInputRegistrations } from "../../../src/command-input-registrations.js";
import { scanCommandInputSources } from "../../../src/lib/command-input/source-scanner.js";

const sourceRoot = resolve(import.meta.dirname, "../../../src");

describe("repository command-input inventory", () => {
  it("reconciles every live syntax and interaction site exactly once", async () => {
    const [source, inventory] = await Promise.all([
      scanCommandInputSources({ sourceRoot }),
      buildRepositoryCommandInputInventory(sourceRoot, commandInputRegistrations),
    ]);
    const syntaxCount = source.commands.reduce(
      (count, command) => count + command.operands.length + command.options.length,
      0,
    );

    expect(inventory.entries).toHaveLength(syntaxCount + source.interactions.length + 1);
    expect(new Set(inventory.entries.map((entry) => entry.identity)).size).toBe(inventory.entries.length);
    expect(inventory.entries.map((entry) => entry.identity)).toEqual(
      [...inventory.entries.map((entry) => entry.identity)].sort(),
    );
  });

  it("renders a stable descriptive table without writing a tracked artifact", async () => {
    const inventory = await buildRepositoryCommandInputInventory(sourceRoot, commandInputRegistrations);
    const rendered = renderCommandInputInventory(inventory);

    expect(rendered).toMatch(/^identity\torigin\tacquisition\tschema\tno-input\tsubprocess\tmutation-boundary\n/u);
    expect(rendered).toContain("release commit:operand.args\tsyntax\topaque-passthrough\topaque");
    expect(rendered.endsWith("\n")).toBe(true);
  });

  it("exact-matches every interaction-capable command to the real-process matrix", async () => {
    const inventory = await buildRepositoryCommandInputInventory(sourceRoot, commandInputRegistrations);
    const interactionCommands = [...new Set(inventory.entries
      .filter((entry) => entry.siteId.startsWith("interaction."))
      .map((entry) => entry.commandPath))].sort();
    expect(NO_INPUT_MATRIX.map((entry) => entry.commandPath).sort()).toEqual(interactionCommands);
  });
});
