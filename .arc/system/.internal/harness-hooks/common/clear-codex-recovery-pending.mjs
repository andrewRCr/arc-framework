import { clearPendingMarkers } from "./codex-recovery-marker.mjs";

const removed = clearPendingMarkers();

process.stdout.write(`${JSON.stringify({ removed })}\n`);
