import { clearPendingMarkers } from "./codex-recovery-marker.mjs";

const markerIndex = process.argv.indexOf("--marker");
const markerPath = markerIndex === -1 ? undefined : process.argv[markerIndex + 1];
const removed = clearPendingMarkers(markerPath === undefined ? {} : { markerPath });

process.stdout.write(`${JSON.stringify({ removed })}\n`);
