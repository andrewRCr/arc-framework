/** Preserve proved hand-edit observations across every take-in outcome. */
import type { TakeInRequest } from "./take-in-port.js";

/** Make the holding entry's changed mark sticky before rights or parsing can refuse its edit. */
export function observeProjectionEdit(request: TakeInRequest, blob?: string): TakeInRequest {
  const observed = request.observedEdit === true || blob !== undefined && differsFromBaseline(request, blob);
  return observed && !request.entry.changed
    ? { ...request, entry: { ...request.entry, changed: true } } : request;
}

function differsFromBaseline(request: TakeInRequest, blob: string): boolean {
  if (request.copy === null) return blob !== request.entry.written;
  const copy = request.entry.copies.find(copy => copy.name === request.copy);
  return copy !== undefined && blob !== copy.moving && blob !== copy.landed;
}
