import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "拼豆底稿生成器",
  title: {
    default: "拼豆底稿生成器",
    template: "%s | 拼豆底稿生成器",
  },
  description: "把图片转换为可编辑、可统计、可照着制作的拼豆底稿。支持常用色号、自定义色板、图纸导出与专心制作，图片仅在本机处理。",
  keywords: ["拼豆", "拼豆底稿", "像素画", "拼豆图纸", "Perler beads"],
  category: "工具",
  referrer: "strict-origin-when-cross-origin",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "拼豆底稿生成器",
    title: "把图片变成真正能照着拼的底稿",
    description: "自动匹配常用色号，精修、统计、制作，一次完成。图片仅在本机处理。",
  },
  twitter: {
    card: "summary",
    title: "拼豆底稿生成器",
    description: "把图片转换成可编辑、可制作的拼豆底稿，图片仅在本机处理。",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "拼豆生成器",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#141413" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden bg-background text-foreground`}
      >
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
