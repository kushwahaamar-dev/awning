// ascii-magic-art ships plain ES modules without types. These are the parts Awning uses.
declare module "ascii-magic-art/runtime/player.js" {
  /** One moment of a piece: its text, and for a piece in colour a layer the same shape whose characters are keys into the palette. */
  export type Frame = string | { text: string; color: string; palette?: Record<string, string> };
  export type Piece = {
    meta: { cols: number; rows: number; fps: number; name: string; palette?: Record<string, string> };
    default: () => (t: number) => Frame;
  };
  type Look = "dots" | "ascii" | "dense" | "numbers" | "binary" | "letters" | "blocks" | "squares" | "lines" | "dither";
  /**
   * Plays a piece on a canvas placed after the <pre>, only while it is on screen. Returns a function that stops it.
   * `invert` prints for light paper, `t0` is the moment it starts from and the one held when it stands still.
   */
  export function play(
    pre: HTMLPreElement,
    piece: Piece,
    options?: { speed?: number; still?: boolean; maxFps?: number; t0?: number; look?: { look?: Look; mono?: boolean; invert?: boolean } },
  ): () => void;
}

declare module "ascii-magic-art/pieces/*.js" {
  import type { Piece } from "ascii-magic-art/runtime/player.js";
  const create: Piece["default"];
  export const meta: Piece["meta"];
  export default create;
}
