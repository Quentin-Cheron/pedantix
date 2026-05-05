import type { Metadata } from "next";
import { Fraunces, Newsreader, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/QueryProvider";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const newsreader = Newsreader({
  variable: "--font-body",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pédantix Libre — Devine la page Wikipédia",
  description:
    "Un Pédantix sans limite : devine une page Wikipédia masquée à l'infini. Chaque partie est un nouvel article aléatoire.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${fraunces.variable} ${newsreader.variable} ${mono.variable} h-dvh antialiased`}
    >
      <body className="h-dvh overflow-hidden flex flex-col">
        <QueryProvider>
          <TooltipProvider delay={150}>
            {children}
            <Toaster theme="light" position="top-center" />
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
