// ascii-magic-art ships plain ES modules without types. These are the parts Awning uses.
declare module "ascii-magic-art/runtime/player.js" {
  export type Piece = { meta: { cols: number; rows: number; fps: number; name: string }; default: () => (t: number) => unknown };
  /**
   * Plays a piece on a canvas placed after the <pre>, only while it is on screen, in the piece's own colours.
   * Returns a function that stops it. `t0` is the moment it starts from, `still` draws that moment and nothing
   * more, and `onFrame` is told the moment each frame drawn belongs to.
   */
  export function play(pre: HTMLPreElement, piece: Piece, options?: { still?: boolean; maxFps?: number; t0?: number; onFrame?: (frame: unknown, t: number) => void }): () => void;
}

declare module "ascii-magic-art/pieces/*.js" {
  import type { Piece } from "ascii-magic-art/runtime/player.js";
  const create: Piece["default"];
  export const meta: Piece["meta"];
  export default create;
}
