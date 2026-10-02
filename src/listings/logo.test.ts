import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryStorage } from "../test/storage";
import { companyDomain, companyDomains, logoSources } from "./logo";

vi.mock("../cloud/userSettings", () => ({
  mirrorLocalSetting: vi.fn(),
}));

describe("company logo domain resolution", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("uses production overrides for common target companies", () => {
    expect(companyDomain("Datadog")).toBe("datadoghq.com");
    expect(companyDomain("Databricks")).toBe("databricks.com");
    expect(companyDomain("Nvidia")).toBe("nvidia.com");
    expect(companyDomain("Cloudflare")).toBe("cloudflare.com");
    expect(companyDomain("Apple")).toBe("apple.com");
    expect(companyDomain("Block")).toBe("block.xyz");
  });

  it("keeps existing special-case financial and defense domains stable", () => {
    expect(companyDomain("D. E. Shaw")).toBe("deshaw.com");
    expect(companyDomain("JPMorgan Chase")).toBe("jpmorganchase.com");
    expect(companyDomain("RTX")).toBe("rtx.com");
    expect(companyDomain("Texas Instruments")).toBe("ti.com");
  });

  it("falls back to full-name and first-word guesses when no override exists", () => {
    expect(companyDomains("Example Robotics")).toEqual(["examplerobotics.com", "example.com"]);
    expect(companyDomains("Acme Technologies, Inc.")).toEqual(["acme.com"]);
  });

  it("builds free logo source URLs from the resolved domain", () => {
    expect(logoSources("Datadog")).toEqual([
      "https://unavatar.io/datadoghq.com?fallback=false",
      "https://icons.duckduckgo.com/ip3/datadoghq.com.ico",
    ]);
  });

  it("prefers Logo.dev when a token is configured", () => {
    localStorage.setItem("internpilot.logo.token", "pub_test");

    expect(logoSources("Databricks")[0]).toBe(
      "https://img.logo.dev/databricks.com?token=pub_test&size=128&format=png&retina=true",
    );
  });
});
