import { describe, expect, it } from "vitest";
import { verdictSchema } from "./agent/decide";
import { interpretationSchema } from "./hedge/interpret";
import { replySchema } from "./model";

const words = (node: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(node)) node.forEach((n) => words(n, found));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      // Field names under "properties" are ours; everything else is a schema word.
      if (key === "properties") Object.values(value as object).forEach((v) => words(v, found));
      else words(value, found.add(key));
    }
  }
  return found;
};

describe("replySchema", () => {
  it("restates the risk's shape in the schema words Google enforces", () => {
    const schema = replySchema(interpretationSchema);
    const used = words(schema);
    for (const unsupported of ["oneOf", "const", "exclusiveMinimum", "$schema"]) expect(used.has(unsupported)).toBe(false);
    expect(used.has("anyOf")).toBe(true);
    // The three kinds of trigger survive as three alternatives, each still told apart by its family.
    const text = JSON.stringify(schema);
    for (const family of ["temperature", "price", "game"]) expect(text).toContain(`"enum":["${family}"]`);
  });

  it("keeps every field of both replies", () => {
    const interpretation = replySchema(interpretationSchema) as { properties: object; required: string[] };
    expect(Object.keys(interpretation.properties).sort()).toEqual(["exposure", "question", "status", "wanted"]);
    expect(interpretation.required.sort()).toEqual(["exposure", "question", "status", "wanted"]);
    const verdict = replySchema(verdictSchema) as { properties: object };
    expect(Object.keys(verdict.properties).sort()).toEqual(["decision", "reason"]);
  });
});
