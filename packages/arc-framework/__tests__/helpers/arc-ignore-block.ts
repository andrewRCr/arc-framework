/** ARC's managed `.ignore` block as the setup verbs write it: each projected root re-included for search tools. */
export const ARC_IGNORE_BLOCK = [
  "# ARC Framework (managed by arc cli)",
  "!.arc/active/",
  "!.arc/backlog/",
  "!.arc/completed/",
  "!.arc/user/*/",
  "# end ARC",
].join("\n");
