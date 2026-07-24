// provisioningMode() resolution matrix (§4a, business-model cleanup wave).
// The stakes: unset/empty must behave as the individual-teacher product
// (open signup → isolated private workspace), while an unrecognized NON-EMPTY
// value must fail CLOSED to the domain allow-list — a typo by an operator who
// was configuring the beta gate must never silently open provisioning.

import { afterEach, describe, expect, it, vi } from "vitest";
import { provisioningMode } from "@/lib/supabase/ensure-teacher";

const setMode = (value: string | undefined): void => {
  if (value === undefined) delete process.env.PROVISIONING_MODE;
  else process.env.PROVISIONING_MODE = value;
};

afterEach(() => {
  delete process.env.PROVISIONING_MODE;
  vi.restoreAllMocks();
});

describe("provisioningMode()", () => {
  it("unset → individual (the product default)", () => {
    setMode(undefined);
    expect(provisioningMode()).toBe("individual");
  });

  it("empty / whitespace → individual", () => {
    setMode("");
    expect(provisioningMode()).toBe("individual");
    setMode("   ");
    expect(provisioningMode()).toBe("individual");
  });

  it("recognized values match case-insensitively with trimming", () => {
    for (const v of ["individual", "Individual", " INDIVIDUAL "]) {
      setMode(v);
      expect(provisioningMode(), v).toBe("individual");
    }
    for (const v of ["domain", "Domain", " DOMAIN "]) {
      setMode(v);
      expect(provisioningMode(), v).toBe("domain");
    }
  });

  it("unrecognized non-empty values FAIL CLOSED to domain, loudly", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const v of ["domian", "school", "true", "1", "individuall"]) {
      setMode(v);
      expect(provisioningMode(), v).toBe("domain");
    }
    expect(err).toHaveBeenCalled();
    expect(String(err.mock.calls[0][0])).toContain("failing CLOSED");
  });
});
