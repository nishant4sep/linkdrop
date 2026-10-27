import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LinkDrop — Find the resource",
  description: "A community-powered directory for resources shared through social posts.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
