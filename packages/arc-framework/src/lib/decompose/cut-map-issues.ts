/** Deterministic author-actionable cut-map diagnostics. */
export interface CutMapIssue {
  code:
    | "unsupported-version"
    | "invalid-structure"
    | "incomplete-authoring"
    | "machine-order"
    | "machine-identity"
    | "authoring-identity"
    | "authoring-order"
    | "source-shape"
    | "companion-disposition"
    | "destination-coverage"
    | "placement-cardinality"
    | "shape-cardinality";
  path: string;
  message: string;
}

