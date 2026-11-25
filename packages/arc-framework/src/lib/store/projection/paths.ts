/** Checkout-relative folders the projection keeps for its own machine-local files. */

/** Folder for the projection's machine-local files, which holds its aside folder. */
export const PROJECTION_LOCAL_ROOT = ".arc/system/.local";

/** The aside folder: the copies a replacement moves aside, the staged files, and the racy reference stamp. */
export const PROJECTION_ASIDE_ROOT = `${PROJECTION_LOCAL_ROOT}/projection`;
