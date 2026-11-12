/** Refuse the root configuration file emitted by an unintended Lefthook install. */
import { existsSync } from "node:fs";

if (existsSync("lefthook.yml")) {
  console.error("Unexpected lefthook.yml: investigate dependency install scripts before removing it and retrying setup.");
  process.exitCode = 1;
}
