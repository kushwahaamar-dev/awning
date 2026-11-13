// ascii-magic-art ships plain ES modules without types. These are the parts Awning uses.
declare module "ascii-magic-art/runtime/player.js" {
  type Piece = { meta: { cols: number; rows: number; fps: number; name: string }; default: () => (t: number) => unknown };
  type Look = "dots" | "ascii" | "dense" | "numbers" | "binary" | "letters" | "blocks" | "squares" | "lines" | "dither";
  /** Plays a piece on a canvas placed after the <pre>, only while it is on screen. Returns a function that stops it. */
  export function play(pre: HTMLPreElement, piece: Piece, options?: { speed?: number; still?: boolean; maxFps?: number; look?: { look?: Look; mono?: boolean } }): () => void;
}

declare module "ascii-magic-art/pieces/*.js" {
  const create: () => (t: number) => unknown;
  export const meta: { cols: number; rows: number; fps: number; name: string };
  export default create;
}
