import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "@fontsource-variable/noto-sans-arabic";
import "./globals.css";
import "./market.css";
import "./identity.css";
import "./portal-parity.css";
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
      <body><svg width="0" height="0" aria-hidden="true" style={{position:"absolute"}}><defs><filter id="gymbank-on-dark" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0 -1.05217 0 0 .94902 0 -.06087 0 0 .95686 0 -.34348 0 0 .96863 0 0 0 1 0"/></filter></defs></svg>{children}</body>
    </html>
  );
}



