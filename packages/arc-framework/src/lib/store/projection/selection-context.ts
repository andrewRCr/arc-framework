/** Store and frozen-local inputs shared by live and atomic-admission adoption selectors. */
import type { Store } from "../contract.js";
import type { Slug } from "../../kernel/index.js";
import type { ProjectionAdmission } from "../projection-admission.js";

/** A selector needs no engine mutation, lease or reporting state. */
export interface ProjectionSelectionContext {
  readonly checkout: string;
  readonly store: Store;
  readonly identity: Slug;
  readonly claim: Slug | null;
  readonly layoutActive: "nested" | "flat";
  readonly context: { readonly verb?: "save" | "write-back" };
  readonly local?: ProjectionAdmission["local"];
}
