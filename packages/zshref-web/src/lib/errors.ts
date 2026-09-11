// Normalise a thrown (`unknown`) value to a display string: an `Error`'s
// message, otherwise its `String(...)` form. Shared by the routes' load/search
// error surfaces and the sanity test's pipeline-load reporting.

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
