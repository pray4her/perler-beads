"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInstallPWA } from "@/hooks/useInstallPWA";

interface InstallPWAProps {
  className?: string;
  compact?: boolean;
}

export default function InstallPWA({ className, compact = false }: InstallPWAProps) {
  const { canInstall, install } = useInstallPWA();

  if (!canInstall) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className={cn("home-nav-install", className)}
      onClick={install}
      aria-label="安装拼豆底稿生成器"
    >
      <Download aria-hidden="true" />
      {compact ? <span className="sr-only">安装应用</span> : "安装应用"}
    </Button>
  );
}
