/** Supplied repair coordinates and independent shell-display expectations. */
export const storeRepairCases = [
  { remedy: { text: "Fetch the missing metadata, then retry.", argv: ["git", "fetch", "origin", "refs/arc/probe exact"] },
    command: "git fetch origin 'refs/arc/probe exact'" },
  { remedy: { text: "Fetch the missing review objects, then retry.", argv: ["git", "fetch", "upstream", "refs/arc/owner's records"] },
    command: `git fetch upstream 'refs/arc/owner'"'"'s records'` },
];
