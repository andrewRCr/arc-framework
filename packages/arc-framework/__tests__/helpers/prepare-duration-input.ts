/** Prepare the common duration artifact before any test job starts. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareDurationInputs } from "./duration-artifacts.js";

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const directory = process.argv[2];
  if (directory === undefined) throw new Error("A duration input directory is required.");
  prepareDurationInputs(directory);
}
