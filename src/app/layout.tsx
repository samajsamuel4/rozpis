import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  variable: "--font-bricolage",
  weight: ["600", "700", "800"],
});

const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Dienstplan — Restaurant Fitz",
  description:
    "Gemeinsamer Schichtplan, freie Tage, Urlaub und Arbeitszeiten für Restaurant Fitz.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0c0a09",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de-AT">
      <body className={`${bricolage.variable} ${manrope.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
