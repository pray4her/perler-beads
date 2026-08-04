"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInstallPWA } from "@/hooks/useInstallPWA";
import { useT } from "@/i18n/context";

interface InstallPWAProps {
  className?: string;
  compact?: boolean;
}

export default function InstallPWA({ className, compact = false }: InstallPWAProps) {
  const { canInstall, install } = useInstallPWA();
  const t = useT();

  if (!canInstall) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className={cn("home-nav-install", className)}
      onClick={install}
      aria-label={t.landing.install.ariaLabel}
    >
      <Download aria-hidden="true" />
      {compact ? <span className="sr-only">{t.landing.install.label}</span> : t.landing.install.label}
    </Button>
  );
}
