'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function PWADebug() {
  const [debugInfo, setDebugInfo] = useState<{
    manifest: object | null | { error: string };
    serviceWorker: object | null;
    https: boolean;
    standalone: boolean;
    installable: boolean;
    installPromptSupported?: boolean;
  }>({
    manifest: null,
    serviceWorker: null,
    https: false,
    standalone: false,
    installable: false,
  });

  useEffect(() => {
    const checkPWA = async () => {
      const info: {
        manifest?: object | null | { error: string };
        serviceWorker?: object | null;
        https?: boolean;
        standalone?: boolean;
        installable?: boolean;
        installPromptSupported?: boolean;
      } = {};

      info.https = window.location.protocol === 'https:' || window.location.hostname === 'localhost';

      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          info.serviceWorker = {
            supported: true,
            registrations: registrations.length,
            active: registrations.some(reg => reg.active),
          };
        } catch (e) {
          info.serviceWorker = { error: e instanceof Error ? e.message : 'Unknown error' };
        }
      } else {
        info.serviceWorker = { supported: false };
      }

      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (manifestLink) {
        try {
          const response = await fetch(manifestLink.getAttribute('href') || '');
          const manifest = await response.json();
          info.manifest = manifest;
        } catch (e) {
          info.manifest = { error: e instanceof Error ? e.message : 'Unknown error' };
        }
      } else {
        info.manifest = { error: 'No manifest link found' };
      }

      info.standalone = window.matchMedia('(display-mode: standalone)').matches;
      info.installPromptSupported = 'onbeforeinstallprompt' in window;

      setDebugInfo({
        manifest: info.manifest || null,
        serviceWorker: info.serviceWorker || null,
        https: info.https || false,
        standalone: info.standalone || false,
        installable: info.installable || false,
        installPromptSupported: info.installPromptSupported,
      });
    };

    checkPWA();
  }, []);

  const statusDot = (active: boolean, neutral = false) =>
    `w-3 h-3 rounded-full shrink-0 ${
      neutral ? 'bg-muted-foreground/40' : active ? 'bg-primary' : 'bg-muted-foreground/60'
    }`;

  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">PWA 调试信息</h1>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>基本检查</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className={statusDot(debugInfo.https)} />
                  HTTPS: {debugInfo.https ? '是' : '否'} ({typeof window !== 'undefined' ? window.location.protocol : 'N/A'})
                </li>
                <li className="flex items-center gap-2">
                  <span className={statusDot(!!debugInfo.serviceWorker)} />
                  Service Worker: {JSON.stringify(debugInfo.serviceWorker, null, 2)}
                </li>
                <li className="flex items-center gap-2">
                  <span className={statusDot(debugInfo.standalone, !debugInfo.standalone)} />
                  独立模式: {debugInfo.standalone ? '是' : '否'}
                </li>
                <li className="flex items-center gap-2">
                  <span className={statusDot(!!debugInfo.installPromptSupported)} />
                  安装提示支持: {debugInfo.installPromptSupported ? '支持' : '不支持'}
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manifest 信息</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
                {JSON.stringify(debugInfo.manifest, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>手动安装方法</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong className="text-foreground">iOS Safari:</strong></p>
                <ol className="list-decimal list-inside ml-4">
                  <li>点击分享按钮（方框带向上箭头）</li>
                  <li>选择&ldquo;添加到主屏幕&rdquo;</li>
                  <li>点击&ldquo;添加&rdquo;</li>
                </ol>

                <p className="mt-4"><strong className="text-foreground">Android Chrome/Edge:</strong></p>
                <ol className="list-decimal list-inside ml-4">
                  <li>点击菜单（三个点）</li>
                  <li>选择&ldquo;添加到主屏幕&rdquo;或&ldquo;安装应用&rdquo;</li>
                  <li>点击&ldquo;添加&rdquo;或&ldquo;安装&rdquo;</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
