/** GitHub Actions entry point for strict neutral attestation dispatch input. */

import { readFile } from "node:fs/promises";

const eventPath = process.env.GITHUB_EVENT_PATH;
if (eventPath === undefined) throw new Error("missing-environment:GITHUB_EVENT_PATH");
const event = JSON.parse(await readFile(eventPath, "utf8")) as { inputs?: { payload?: unknown } };
if (typeof event.inputs?.payload !== "string" || event.inputs.payload.length > 16_384) {
  throw new Error("invalid-attestation-payload");
}
const attestation = JSON.parse(event.inputs.payload) as unknown;
if (typeof attestation !== "object" || attestation === null || Array.isArray(attestation)) {
  throw new Error("invalid-attestation-payload");
}
process.stdout.write(JSON.stringify(attestation));
