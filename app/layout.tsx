import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: "Convoke — Your ideas, taking shape",
  description: "An AI workspace for making, understanding, and keeping your ideas moving.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <script src="https://accounts.google.com/gsi/client" async defer />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
