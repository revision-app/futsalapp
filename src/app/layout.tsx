import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "REVISION",
  description: "フットサルチームの出欠・MVP管理アプリ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
