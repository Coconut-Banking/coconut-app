import { timeGreetingPhrase, formatHomeGreetingLine } from "./home-greeting";

describe("timeGreetingPhrase", () => {
  const at = (hour: number) => {
    const d = new Date(2026, 0, 1, hour, 0, 0);
    return timeGreetingPhrase(d);
  };

  it("returns Hey for late night (0-4)", () => {
    expect(at(0)).toBe("Hey");
    expect(at(3)).toBe("Hey");
    expect(at(4)).toBe("Hey");
  });

  it("returns Good morning for 5-11", () => {
    expect(at(5)).toBe("Good morning");
    expect(at(11)).toBe("Good morning");
  });

  it("returns Good afternoon for 12-16", () => {
    expect(at(12)).toBe("Good afternoon");
    expect(at(16)).toBe("Good afternoon");
  });

  it("returns Good evening for 17-21", () => {
    expect(at(17)).toBe("Good evening");
    expect(at(21)).toBe("Good evening");
  });

  it("returns Hey for late night (22-23)", () => {
    expect(at(22)).toBe("Hey");
    expect(at(23)).toBe("Hey");
  });
});

describe("formatHomeGreetingLine", () => {
  const morning = new Date(2026, 0, 1, 9, 0, 0);

  it("includes name when provided", () => {
    expect(formatHomeGreetingLine("Alex", morning)).toBe("Good morning, Alex");
  });

  it("omits name when empty", () => {
    expect(formatHomeGreetingLine("", morning)).toBe("Good morning");
  });

  it("trims whitespace-only name", () => {
    expect(formatHomeGreetingLine("   ", morning)).toBe("Good morning");
  });
});
