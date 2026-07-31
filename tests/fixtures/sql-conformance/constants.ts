/**
 * A SQL fragment shared across modules.
 *
 * Imported by safe.ts, so the checker's cross-module resolution is exercised rather
 * than merely implemented.
 */
export const SHARED_ORDER_CLAUSE = `ORDER BY v.published_at DESC NULLS LAST`
