import { expect, test } from "vitest";
import { typeset } from "./format";
test("a character that isn't one is mended", () => {
  expect(typeset("If the daily high in Houston is at 74\u0000F or below tomorrow")).toBe("If the daily high in Houston is at 74°F or below tomorrow");
  expect(typeset("under 60�F, the owner's patio")).toBe("under 60°F, the owner’s patio");
  expect(typeset("a\u0001b 45°F")).toBe("ab 45°F");
  expect(typeset("two lines\nstay two")).toBe("two lines\nstay two");
});
