"use client";

import Image from "next/image";
import { ChevronRight, Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { isSupportConfigured, supportConfig } from "@/config/support";
import { useT } from "@/i18n/context";
import { useState } from "react";

export default function SupportRail() {
  const t = useT();
  const [collapsed, setCollapsed] = useState(false);

  if (!isSupportConfigured(supportConfig)) return null;

  return (
    <aside className={`support-rail ${collapsed ? "is-collapsed" : ""}`} aria-label={t.home.support.railAriaLabel}>
      <button
        type="button"
        className="support-rail-collapse"
        onClick={() => setCollapsed((value) => !value)}
        aria-label={collapsed ? t.home.support.expand : t.home.support.collapse}
        aria-expanded={!collapsed}
      >
        <ChevronRight aria-hidden="true" />
      </button>
      <Dialog>
        <DialogTrigger
          render={
            <Button type="button" className="support-rail-button" size="lg" />
          }
        >
          <Coffee aria-hidden="true" />
          <span>{t.home.support.trigger}</span>
        </DialogTrigger>
        <DialogContent className="support-dialog sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl">{t.home.support.dialogTitle}</DialogTitle>
            <DialogDescription className="max-w-[48ch] leading-relaxed">
              {t.home.support.dialogDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="support-qr-grid">
            <figure>
              <Image src={supportConfig.wechatQrSrc} alt={t.home.support.wechatQrAlt} width={320} height={320} />
              <figcaption>{t.home.support.wechat}</figcaption>
            </figure>
            <figure>
              <Image src={supportConfig.alipayQrSrc} alt={t.home.support.alipayQrAlt} width={320} height={320} />
              <figcaption>{t.home.support.alipay}</figcaption>
            </figure>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t.home.support.donationNote}
          </p>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
