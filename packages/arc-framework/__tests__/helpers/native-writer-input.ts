/** Read the fixture-owned handed input independently of mutable native cache and report writers. */
import { readFileSync, realpathSync } from "node:fs";

/** Observe the private input bytes and physical file at a native lifecycle boundary. */
export function readNativeWriterInput(): { file: string; contents: string } | undefined {
  const file = process.env.ARC_TEST_DURATION_FILE;
  return file ? { file: realpathSync.native(file), contents: readFileSync(file, "utf8") } : undefined;
}
