# Tracked-state import

The migration command uses this one-time transform to read the in-repository store, validate every source record,
and prepare ref commits. The store composition point supplies the source. Source acquisition, admission, destination
inspection, and publication stay separate so a refused build publishes no state.
