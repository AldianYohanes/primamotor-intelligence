const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : [0, 0, 0];
};

const rgbToHex = (r: number, g: number, b: number): string => {
  return (
    "#" +
    [r, g, b]
      .map((x) => Math.min(255, Math.max(0, x)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
};

export const lighten = (hex: string, percent: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const amount = Math.round(255 * (percent / 100));
  return rgbToHex(r + amount, g + amount, b + amount);
};

export const darken = (hex: string, percent: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const amount = Math.round(255 * (percent / 100));
  return rgbToHex(r - amount, g - amount, b - amount);
};
