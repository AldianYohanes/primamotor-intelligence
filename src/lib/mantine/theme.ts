import {
  Button,
  Card,
  createTheme,
  Modal,
  Paper,
  Select,
  TextInput,
  rem,
  type MantineColorsTuple,
} from "@mantine/core";

/**
 * Accent scale generated from the base brand color #f1a82f (index 6).
 * If you need pixel-exact intermediate shades later, re-run this through
 * Mantine's official color generator: https://mantine.dev/colors-generator/
 */
const accent: MantineColorsTuple = [
  "#fdf7ec",
  "#fbedd5",
  "#f8dbaa",
  "#f4c87b",
  "#f1b855",
  "#f0b042",
  "#f1a82f", // base
  "#ec9c13",
  "#c68310",
  "#a06a0d",
];

/**
 * Warm-tinted neutral scale replacing Mantine's default cool "dark" palette,
 * so dark mode stays visually consistent with the warm #f8f8f6 canvas
 * instead of clashing with a bluish-gray default.
 */
const dark: MantineColorsTuple = [
  "#F8F8F6", // 0 - lightest (dark-mode primary text)
  "#D9D9D6",
  "#BFBFBB",
  "#A6A6A1",
  "#8C8C87",
  "#6B6B66",
  "#4A4A46",
  "#302F2C", // 7 - dark-mode surface (cards, paper)
  "#221F1C", // 8 - dark-mode body background
  "#171512", // 9 - darkest
];

export const theme = createTheme({
  fontFamily:
    "var(--font-outfit), -apple-system, BlinkMacSystemFont, sans-serif",
  fontFamilyMonospace: 'ui-monospace, "SF Mono", Consolas, Menlo, monospace',

  headings: {
    // Forum is a single-weight (400) display serif, so we pin fontWeight
    // globally rather than letting Mantine try 700 for h1/h2.
    fontFamily: "var(--font-forum), Georgia, serif",
    fontWeight: "400",
    sizes: {
      h1: { fontSize: rem(40), lineHeight: "1.15" },
      h2: { fontSize: rem(32), lineHeight: "1.2" },
      h3: { fontSize: rem(26), lineHeight: "1.25" },
      h4: { fontSize: rem(22), lineHeight: "1.3" },
      h5: { fontSize: rem(18), lineHeight: "1.35" },
      h6: { fontSize: rem(16), lineHeight: "1.4" },
    },
  },

  colors: { accent, dark },
  primaryColor: "accent",
  primaryShade: { light: 6, dark: 6 },

  black: "#221F1C",
  white: "#FFFFFF",

  defaultRadius: "md",

  // Component-level defaults — this is the single source of truth for
  // "default styling" instead of scattering radius/variant props across
  // every feature module.
  components: {
    Button: Button.extend({
      defaultProps: { radius: "md" },
    }),
    Card: Card.extend({
      defaultProps: { radius: "lg", withBorder: true, padding: "lg" },
    }),
    Paper: Paper.extend({
      defaultProps: { radius: "lg" },
    }),
    Modal: Modal.extend({
      defaultProps: {
        radius: "lg",
        centered: true,
        overlayProps: { backgroundOpacity: 0.55, blur: 2 },
      },
    }),
    TextInput: TextInput.extend({
      defaultProps: { radius: "md" },
    }),
    Select: Select.extend({
      defaultProps: { radius: "md" },
    }),
  },

  // Free-form tokens for anything Mantine doesn't natively cover
  // (e.g. custom shadow used in DataView cards, chart accents, etc.)
  other: {
    canvas: "#f8f8f6",
    shadowSm: "0 1px 2px rgba(34, 31, 28, 0.06)",
    shadowMd: "0 4px 12px rgba(34, 31, 28, 0.08)",
  },
});
