/**
 * WCAG 2.1 Contrast Ratio & Relative Luminance Calculator
 */

/**
 * Parse hex, rgb, or rgba string into { r, g, b, a } (0-255 for RGB, 0-1 for A).
 * @param {string} colorStr
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
export function parseColor(colorStr) {
  if (!colorStr || typeof colorStr !== 'string') {
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  const s = colorStr.trim().toLowerCase();

  // Hex format (#rgb, #rgba, #rrggbb, #rrggbbaa)
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: parseInt(hex[3] + hex[3], 16) / 255,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
  }

  // rgb(...) or rgba(...) format
  const rgbMatch = s.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbMatch) {
    return {
      r: Math.min(255, Math.max(0, parseFloat(rgbMatch[1]))),
      g: Math.min(255, Math.max(0, parseFloat(rgbMatch[2]))),
      b: Math.min(255, Math.max(0, parseFloat(rgbMatch[3]))),
      a: rgbMatch[4] !== undefined ? Math.min(1, Math.max(0, parseFloat(rgbMatch[4]))) : 1,
    };
  }

  // Common named fallbacks
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  return { r: 0, g: 0, b: 0, a: 1 };
}

/**
 * Composite foreground color over background color considering alpha channel.
 */
export function compositeColors(fgColor, bgColor) {
  const fg = typeof fgColor === 'string' ? parseColor(fgColor) : fgColor;
  const bg = typeof bgColor === 'string' ? parseColor(bgColor) : bgColor;

  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

/**
 * Compute WCAG 2.1 relative luminance for an sRGB color.
 * L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin
 */
export function getRelativeLuminance(color) {
  const c = typeof color === 'string' ? parseColor(color) : color;
  const channels = [c.r / 255, c.g / 255, c.b / 255];

  const linearized = channels.map((val) => {
    return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * linearized[0] + 0.7152 * linearized[1] + 0.0722 * linearized[2];
}

/**
 * Compute WCAG 2.1 contrast ratio between two colors.
 * CR = (L1 + 0.05) / (L2 + 0.05)
 * Returns a number >= 1.0 (e.g. 4.54 for 4.54:1).
 */
export function getContrastRatio(fgColor, bgColor) {
  const fgComposited = compositeColors(fgColor, bgColor);
  const l1 = getRelativeLuminance(fgComposited);
  const l2 = getRelativeLuminance(bgColor);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}
