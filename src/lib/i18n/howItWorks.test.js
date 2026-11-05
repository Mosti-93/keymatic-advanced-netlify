import { describe, it, expect } from "vitest";
import { LANGUAGES, pickLang, isRtl } from "./languages";
import { HOW_IT_WORKS } from "./howItWorks";

describe("how it works translations", () => {
  it("has every language, with the same shape as English", () => {
    const en = HOW_IT_WORKS.en;
    expect(LANGUAGES).toHaveLength(10);
    for (const { code } of LANGUAGES) {
      const t = HOW_IT_WORKS[code];
      expect(t, code).toBeTruthy();
      expect(Object.keys(t).sort(), code).toEqual(Object.keys(en).sort());
      expect(t.steps, code).toHaveLength(en.steps.length);
      expect(t.notes, code).toHaveLength(en.notes.length);
      for (const v of Object.values(t)) {
        if (typeof v === "string") expect(v.trim(), code).not.toBe("");
      }
    }
  });

  it("falls back to English and knows right-to-left", () => {
    expect(pickLang("AR")).toBe("ar");
    expect(pickLang("de-DE")).toBe("de");
    expect(pickLang("xx")).toBe("en");
    expect(pickLang(undefined)).toBe("en");
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
  });
});
