import { describe, expect, it } from "vitest";
import { companyInitials } from "./CompanyLogo";

describe("companyInitials", () => {
  it("uses two letters for one-word company names", () => {
    expect(companyInitials("Nvidia")).toBe("NV");
    expect(companyInitials("Datadog")).toBe("DA");
  });

  it("uses first letters for multi-word company names", () => {
    expect(companyInitials("Palo Alto Networks")).toBe("PA");
    expect(companyInitials("Johnson & Johnson")).toBe("JJ");
  });

  it("handles numeric and empty names", () => {
    expect(companyInitials("84.51°")).toBe("84");
    expect(companyInitials("")).toBe("?");
  });
});
