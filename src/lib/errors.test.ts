import { describe, expect, it } from "vitest";
import { authErrorMessage, userErrorMessage } from "./errors";

describe("error message helpers", () => {
  it("returns ordinary error messages", () => {
    expect(userErrorMessage(new Error("Plain failure"))).toBe("Plain failure");
  });

  it("explains Supabase confirmation-email delivery failures", () => {
    expect(authErrorMessage(new Error("Error sending confirmation email"))).toContain("configure Supabase SMTP");
  });
});
