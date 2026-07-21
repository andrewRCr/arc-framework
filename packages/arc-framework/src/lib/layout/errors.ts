/** Stable failures emitted by ARC layout projection and materialization. */

import { ArcError } from "../kernel/index.js";

/** Locally exhaustive layout failure codes. */
export type LayoutErrorCode =
  | "layout.invalid-address"
  | "layout.invalid-template-path"
  | "layout.invalid-managed-path"
  | "layout.invalid-materialization-root";

/** Layout-domain error with a locally exhaustive code contract. */
export class LayoutError extends ArcError {
  override readonly code: LayoutErrorCode;

  constructor(message: string, code: LayoutErrorCode, options?: ErrorOptions) {
    super(message, code, options);
    this.name = "LayoutError";
    this.code = code;
  }
}
