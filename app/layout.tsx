import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://wuyuying003.github.io"),
  title: "好运钱庄｜翻牌收集游戏",
  description: "看广告翻卡牌，集齐四个同款赢取奖励。",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "好运钱庄｜翻牌收集游戏",
    description: "翻牌集同款，赢取好运奖励",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "好运钱庄翻牌收集游戏" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "好运钱庄｜翻牌收集游戏",
    description: "翻牌集同款，赢取好运奖励",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
