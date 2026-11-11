import { describe, expect, it } from "vitest";
import { locateQuote, spanMatches } from "@/lib/tools/spans";

const text = "The north section is 61 years old.\nIt\u2019s cracked along   340 meters.";

describe("spans", () => {
  it("locates exact quotes", () => {
    const s = locateQuote(text, "61 years old")!;
    expect(text.slice(s.start, s.end)).toBe("61 years old");
  });
  it("locates quotes that differ only by whitespace, case and curly quotes", () => {
    const s = locateQuote(text, "it's cracked along 340 meters")!;
    expect(s).not.toBeNull();
    expect(text.slice(s.start, s.end)).toBe("It\u2019s cracked along   340 meters");
    expect(spanMatches(text, s, "it's cracked along 340 meters")).toBe(true);
  });
  it("returns null for words that are not in the text", () => {
    expect(locateQuote(text, "the wall is brand new and fine")).toBeNull();
  });
  it("rejects out-of-range or mismatched spans", () => {
    expect(spanMatches(text, { start: 0, end: 9999 }, "x")).toBe(false);
    expect(spanMatches(text, { start: 4, end: 9 }, "61 years old")).toBe(false);
  });
});
