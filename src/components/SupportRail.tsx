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
import { useState } from "react";

export default function SupportRail() {
  const [collapsed, setCollapsed] = useState(false);

  if (!isSupportConfigured(supportConfig)) return null;

  return (
    <aside className={`support-rail ${collapsed ? "is-collapsed" : ""}`} aria-label="支持工具维护">
      <button
        type="button"
        className="support-rail-collapse"
        onClick={() => setCollapsed((value) => !value)}
        aria-label={collapsed ? "展开支持按钮" : "收起支持按钮"}
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
          <span>支持这个免费工具</span>
        </DialogTrigger>
        <DialogContent className="support-dialog sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl">支持拼豆底稿生成器</DialogTitle>
            <DialogDescription className="max-w-[48ch] leading-relaxed">
              如果这个工具帮你省下了时间，可以请维护者喝杯咖啡。支持完全自愿，不影响任何功能。
            </DialogDescription>
          </DialogHeader>
          <div className="support-qr-grid">
            <figure>
              <Image src={supportConfig.wechatQrSrc} alt="微信收款码" width={320} height={320} />
              <figcaption>微信</figcaption>
            </figure>
            <figure>
              <Image src={supportConfig.alipayQrSrc} alt="支付宝收款码" width={320} height={320} />
              <figcaption>支付宝</figcaption>
            </figure>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            赞助款由工具维护者本人收取，用于持续维护、兼容性修复与功能改进。
          </p>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
