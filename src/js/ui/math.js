export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => {
  k = k === undefined ? 0.5 : k;
  return a + (b - a) * k;
};
export const prel = (v, a, b) => (v - a) / (b - a);

// EOF
