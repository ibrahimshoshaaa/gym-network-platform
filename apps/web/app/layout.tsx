import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "@fontsource-variable/noto-sans-arabic";
import "./globals.css";
import "./identity.css";
export const metadata: Metadata = {
  title: "GymBank | رصيد واحد، كل الجيمات",
  description: "شبكة جيمات، محفظة نقاط واحدة، وتجربة تمرين أسهل.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}

