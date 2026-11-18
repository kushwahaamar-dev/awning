// The way everything drawn on the site is seen: a model measured in its own units, x along its front, y out
// towards the eye and z up, looked at from a little to one side and a little above.
export type Point = [x: number, y: number, z: number];
/** Where the eye is: how far round the corner, how far above, how far back, and how far the picture is moved up to stay in its frame. */
export type View = { turn: number; tilt: number; zoom: number; lift: number };

export const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The picture a point in the model lands on, for one position of the eye. */
export function camera({ turn, tilt, zoom, lift }: View) {
  const across = [Math.cos(turn) * zoom, -Math.sin(turn) * zoom];
  const down = [Math.sin(turn) * Math.sin(tilt) * zoom, Math.cos(turn) * Math.sin(tilt) * zoom, -Math.cos(tilt) * zoom];
  /** How a length in the model lies in the picture. */
  const along = ([x, y, z]: Point) => [x * across[0] + y * across[1], x * down[0] + y * down[1] + z * down[2]];
  const at = (point: Point) => {
    const [left, top] = along(point);
    return [left, top + lift];
  };
  /** Lays a flat drawing into the picture: its corner at `corner`, its width running along `right` and its height along `up`. */
  const plane = (corner: Point, right: Point, up: Point) => `matrix(${[...along(right), ...along(up), ...at(corner)].map((n) => n.toFixed(3)).join(" ")})`;
  return { at, plane, rise: -down[2] };
}
