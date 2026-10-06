"use client";

import { createTheme } from "@mantine/core";

export const theme = createTheme({
  fontFamily: "var(--font-family-sans), sans-serif",
  fontFamilyMonospace: "var(--font-mono), monospace",
  headings: {
    fontFamily: "var(--font-family-sans), sans-serif",
  },
  primaryColor: "blue",
  defaultRadius: 0,
});
