import type { Metadata } from "next";
// Bundled with the app (next/font/local) rather than fetched from Google Fonts, so the reader
// works offline. They set --font-geist-sans / --font-geist-mono.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "katex/dist/katex.min.css";
import "./globals.css";
import { TimerProvider } from "@/components/timer/TimerProvider";
import { themeScript } from "@/components/theme";

export const metadata: Metadata = {
  title: "Parrot",
  description: "A local reader for research papers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the theme script sets data-theme before React hydrates.
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <TimerProvider>{children}</TimerProvider>
      </body>
    </html>
  );
}
