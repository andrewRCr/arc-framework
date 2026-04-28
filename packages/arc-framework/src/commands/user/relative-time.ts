/**
 * Format a past timestamp as a human-readable relative phrase
 * ("11 hours ago", "2 days ago"). Used for rendering the saved-note
 * commit's author date in status output.
 */
export function formatRelativeTime(past: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - past.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
