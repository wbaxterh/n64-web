import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "../styles/n64.css";

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "N64.wasm — Browser N64 Emulator",
  description:
    "The best N64 emulator on the internet. SIMD-powered, browser-native. A TrickBook project.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jetbrains.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-[var(--n64-bg)] text-[var(--n64-text)] font-mono">
        {children}
      </body>
    </html>
  );
}
