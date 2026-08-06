import { version } from "../package.json";

// Inlined by bun at bundle time, so the compiled binary carries the version it
// was built from — the primitive install idempotency and the update hook key on.
export const VERSION: string = version;
