import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "어서화 - 꽃 배달 플랫폼",
  description: "어서화에서 특별한 꽃을 만나보세요. 신선한 꽃다발, 화분, 꽃바구니를 빠르게 배달해 드립니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
