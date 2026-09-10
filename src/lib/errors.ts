export function userErrorMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const rec = error as Record<string, unknown>;
    for (const key of ["message", "error_description", "details", "hint", "code"]) {
      const value = rec[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return fallback;
}
