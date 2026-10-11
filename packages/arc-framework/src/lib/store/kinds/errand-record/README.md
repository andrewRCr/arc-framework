# Errand record checks

`registration.ts` installs the shared former-slug and slug-edge rules for the Errand primary record. Both rules run
over the caller's supplied before and after views, returning every broken rule for the proposed write.
