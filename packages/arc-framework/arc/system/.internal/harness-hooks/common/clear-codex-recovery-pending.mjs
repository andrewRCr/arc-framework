import { clearPendingMarkers } from "./codex-recovery-marker.mjs";

const markerIndex = process.argv.indexOf("--marker");
if (markerIndex !== -1 && markerIndex + 1 >= process.argv.length) {
  throw new Error("Missing value for --marker");
}
const markerPath = markerIndex === -1 ? undefined : process.argv[markerIndex + 1];
const removed = clearPendingMarkers(markerPath === undefined ? {} : { markerPath });

process.stdout.write(`${JSON.stringify({ removed })}\n`);
