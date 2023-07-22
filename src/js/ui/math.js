export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => {
  k = k === undefined ? 0.5 : k;
  return a + (b - a) * k;
};
export const prel = (v, a, b) => (v - a) / (b - a);

export const point = (x = 0, y = 0) => [x, y, 0, 0];
export const rect = (x = 0, y = 0, w = 1, h = 1) => [x, y, w, h];
export const vmul = ([ax, ay, aw, ah], [bx, by, bw, bh]) => [
  ax * bx,
  ay * by,
  aw * bw,
  ah * bh,
];
export const vdiv = ([ax, ay, aw, ah], [bx, by, bw, bh]) => [
  ax / bx,
  ay / by,
  aw / bw,
  ah / bh,
];
export const vadd = ([ax, ay, aw, ah], [bx, by, bw, bh]) => [
  ax + bx,
  ay + by,
  aw + bw,
  ah + bh,
];
export const vsub = ([ax, ay, aw, ah], [bx, by, bw, bh]) => [
  ax - bx,
  ay - by,
  aw - bw,
  ah - bh,
];
// EOF
