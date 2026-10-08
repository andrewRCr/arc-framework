/** Merge writer-shard duration artifacts for the next run's common input. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeDurationArtifacts } from "./duration-artifacts.js";

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [input, output] = process.argv.slice(2);
  if (input === undefined || output === undefined) throw new Error("Artifact input and duration output directories are required.");
  mergeDurationArtifacts(input, output);
}
