import type { Metadata, Viewport } from "next";
import { Figtree, Syne } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin", "latin-ext"],
  variable: "--font-syne",
  weight: ["600", "700", "800"],
});

const figtree = Figtree({
  subsets: ["latin", "latin-ext"],
  variable: "--font-figtree",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Rozpis — tímový pracovný kalendár",
  description:
    "Spoločný rozpis zmien a žiadostí o voľno. Otvorte kedykoľvek z telefónu alebo počítača.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#1f4d3a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk">
      <body className={`${syne.variable} ${figtree.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
