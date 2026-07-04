import { clearPendingMarkers, recoveryCompleteBanner } from "./codex-recovery-marker.mjs";

const markerIndex = process.argv.indexOf("--marker");
if (markerIndex !== -1 && markerIndex + 1 >= process.argv.length) {
  throw new Error("Missing value for --marker");
}
const markerPath = markerIndex === -1 ? undefined : process.argv[markerIndex + 1];
const removed = clearPendingMarkers(markerPath === undefined ? {} : { markerPath });

// Close the recovery window with the matching banner — but only when a marker was
// actually removed, so re-running the clear (idempotent) stays quiet.
if (removed.length > 0) {
  process.stdout.write(`${recoveryCompleteBanner}\n`);
}
