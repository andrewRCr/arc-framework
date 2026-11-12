/** Source conflict repairs name the projection resolution command exactly when it is registered. */
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { loadRepositoryCommandInputSnapshot } from "../../src/lib/command-input/repository-inventory.js";
import { DECOMPOSE_SOURCE_CONFLICT_REMEDY } from "../../src/lib/decompose/source-conflicts.js";

it("pairs the source conflict remedy with a registered top-level save resolution option", async () => {
  const sourceRoot = resolve(import.meta.dirname, "../../src");
  const inventory = await loadRepositoryCommandInputSnapshot(sourceRoot);
  const registered = inventory.source.commands.some(command => command.path === "save"
    && command.options.some(option => /--resolve(?:\s|$)/u.test(option.flags)));
  expect(DECOMPOSE_SOURCE_CONFLICT_REMEDY.includes("arc save --resolve <token>")).toBe(registered);
}, 30_000);
