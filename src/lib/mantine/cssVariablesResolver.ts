import type { CSSVariablesResolver } from "@mantine/core";
import { theme } from "./theme";

/**
 * This is where "custom default styling for Mantine components" actually
 * lives at the token level — anything set here overrides Mantine's internal
 * CSS variables globally, without needing to touch each component's props.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    "--mantine-font-family-headings": "var(--font-forum), Georgia, serif",
  },
  light: {
    "--mantine-color-body": "#f8f8f6",
    "--mantine-color-text": theme.colors!.dark![8],
    "--mantine-color-default-border": theme.colors!.dark![2],
    "--mantine-color-placeholder": theme.colors!.dark![4],
    "--mantine-color-dimmed": theme.colors!.dark![5],
  },
  dark: {
    "--mantine-color-body": theme.colors!.dark![8],
    "--mantine-color-text": theme.colors!.dark![0],
    "--mantine-color-default-border": theme.colors!.dark![6],
    "--mantine-color-placeholder": theme.colors!.dark![4],
    "--mantine-color-dimmed": theme.colors!.dark![3],
  },
});
