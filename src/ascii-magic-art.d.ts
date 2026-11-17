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

// The toolbox the library's pieces are made with, which Awning's own piece is made with too.
declare module "ascii-magic-art/lib/kit.js" {
  import type { Frame } from "ascii-magic-art/runtime/glyphs.js";
  /** A sheet of cells, each holding one character and the key of its colour. */
  export class Grid {
    constructor(cols: number, rows: number);
    clear(): this;
    set(x: number, y: number, glyph: string, colour?: string): void;
    frame(): Frame;
  }
  /** A source of numbers from 0 to 1 that gives the same run every time for the same seed. */
  export function rng(seed?: number): () => number;
  export function clamp(value: number, low?: number, high?: number): number;
  /** Eases 0..1 in and out. */
  export function smooth(t: number): number;
}

declare module "ascii-magic-art/pieces/*.js" {
  import type { Piece } from "ascii-magic-art/runtime/glyphs.js";
  const create: Piece["default"];
  export const meta: Piece["meta"];
  export default create;
}
