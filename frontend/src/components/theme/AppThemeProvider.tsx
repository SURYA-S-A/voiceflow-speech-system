"use client";

import { ThemeProvider as NextThemesProvider, ThemeProviderProps } from "next-themes";

export const AppThemeProvider = ({ children, ...props }: ThemeProviderProps) => {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
  