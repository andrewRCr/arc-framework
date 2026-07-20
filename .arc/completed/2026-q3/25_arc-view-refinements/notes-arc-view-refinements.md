# Notes: arc-view-refinements

## Clock presentation rationale

- Keep the rendered-at stamp time-only. It communicates within-day freshness for a render-once command that users
  refresh directly; a date adds little signal.
- Do not use relative time. A value such as “just now” freezes when the command exits and therefore cannot describe
  increasing staleness.
