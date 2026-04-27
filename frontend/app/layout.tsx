import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RideSense",
  description: "Multi-source cycling training insights from TrainerRoad and Strava."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
