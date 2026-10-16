import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "好多鱼图文",
  description: "个人图文工作台：上传文章、自动配图排版、保存头条草稿",
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
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
