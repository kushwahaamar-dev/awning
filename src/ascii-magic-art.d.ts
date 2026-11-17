// ascii-magic-art ships plain ES modules without types. These are the parts Awning uses: the pieces themselves,
// and the library's measure of how much ink each character lays down. Awning prints the frames itself.
declare module "ascii-magic-art/runtime/glyphs.js" {
  /** One moment of a piece: its text, and for a piece in colour a layer the same shape whose characters are keys into the palette. */
  export type Frame = string | { text: string; color: string };
  export type Piece = {
    meta: { cols: number; rows: number; fps: number; name: string; palette?: Record<string, string> };
    default: () => (t: number) => Frame;
  };
  /** How much of its cell a character covers, from 0 to 100. */
  export function cover(glyph: string): number;
}

declare module "ascii-magic-art/pieces/*.js" {
  import type { Piece } from "ascii-magic-art/runtime/glyphs.js";
  const create: Piece["default"];
  export const meta: Piece["meta"];
  export default create;
}
