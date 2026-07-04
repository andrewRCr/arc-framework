import { clearPendingMarkers, readHookInput, recoveryCompleteBanner } from "./codex-recovery-marker.mjs";

const markerIndex = process.argv.indexOf("--marker");
if (markerIndex !== -1 && markerIndex + 1 >= process.argv.length) {
  throw new Error("Missing value for --marker");
}
const markerPath = markerIndex === -1 ? undefined : process.argv[markerIndex + 1];
// SessionStart(clear) sweeps by session scope, read from the hook's stdin payload.
// The agent-invoked `--marker <path>` form targets one marker and reads no stdin —
// there is no hook payload there, and reading an inherited, unclosed fd 0 could hang.
const removed = markerPath === undefined
  ? clearPendingMarkers({ sessionId: readHookInput().sessionId })
  : clearPendingMarkers({ markerPath });

// Close the recovery window with the matching banner — but only when a marker was
// actually removed, so re-running the clear (idempotent) stays quiet.
if (removed.length > 0) {
  process.stdout.write(`${recoveryCompleteBanner}\n`);
}
