import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getDictionary } from "@/i18n/getDictionary";
import { languageAlternates, siteUrl } from "@/i18n/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const zhMeta = getDictionary("zh").metadata;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: zhMeta.siteName,
  title: {
    default: zhMeta.home.title,
    template: `%s | ${zhMeta.siteName}`,
  },
  description: zhMeta.home.description,
  keywords: zhMeta.home.keywords,
  category: "工具",
  referrer: "strict-origin-when-cross-origin",
  manifest: "/manifest.json",
  alternates: {
    canonical: "/",
    languages: languageAlternates,
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: zhMeta.siteName,
    url: `${siteUrl}/`,
    title: zhMeta.home.ogTitle,
    description: zhMeta.home.ogDescription,
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: zhMeta.siteName,
    description: zhMeta.home.ogDescription,
    images: ["/og-image.png"],
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
