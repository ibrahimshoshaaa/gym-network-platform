import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Gym Network | لوحة التحكم",
  description: "إدارة شبكة الجيمات والنقاط وطلبات الشحن",
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
