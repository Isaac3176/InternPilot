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

export function authErrorMessage(error: unknown): string {
  const message = userErrorMessage(error, "Couldn't complete authentication. Try again.");
  if (/confirmation email|send.*email|email.*send|smtp/i.test(message)) {
    return "We couldn't send the confirmation email. The account was not created. Ask the InternPilot admin to disable email confirmations for the instant onboarding flow, or configure Supabase SMTP, then try again.";
  }
  return message;
}
