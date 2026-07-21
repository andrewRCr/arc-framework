/** Development command for rendering the reconciled command-input inventory. */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildRepositoryCommandInputInventory,
  renderCommandInputInventory,
} from "../lib/command-input/repository-inventory.js";
import { commandInputRegistrations } from "../command-input-registrations.js";

async function main(): Promise<void> {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex === -1 ? undefined : process.argv[outputIndex + 1];
  if (outputIndex !== -1 && (output === undefined || output.trim() === "")) {
    throw new Error("--output requires a path");
  }
  const sourceRoot = resolve(import.meta.dirname, "..");
  const rendered = renderCommandInputInventory(
    await buildRepositoryCommandInputInventory(sourceRoot, commandInputRegistrations),
  );
  if (output === undefined) process.stdout.write(rendered);
  else await writeFile(resolve(output), rendered, "utf8");
}

await main();
