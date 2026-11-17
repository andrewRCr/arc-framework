/** The tracked operational-state surfaces that must cross the window through the import. */
import { posix } from "node:path";
import { PROJECTED_LIFECYCLE_ROOTS, resolveArcPath } from "../../lib/layout/index.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";

const example = SlugSchema.parse("example");
/** Lifecycle roots and the two internal record namespaces acquired by the tracked import. */
export const WINDOW_TRACKED_STATE_ROOTS: readonly string[] = [...PROJECTED_LIFECYCLE_ROOTS,
  posix.dirname(resolveArcPath({ kind: "candidate-record", slug: example })),
  posix.dirname(resolveArcPath({ kind: "transition-record", origin: example })),
];
