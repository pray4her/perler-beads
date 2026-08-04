"use client";

import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";

import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

interface FieldHelpProps {
  label: string;
  htmlFor?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * 字段标签 + “?”说明图标：标签保持简洁，详细解释收进 Popover，
 * 悬停或点击图标即可查看，不打断表单布局。
 */
export default function FieldHelp({
  label,
  htmlFor,
  title,
  children,
  className,
}: FieldHelpProps) {
  const t = useT();
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <Popover>
        <PopoverTrigger
          aria-label={t.workspace.fieldHelp.triggerAriaLabel(label)}
          className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelp className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>{title ?? label}</PopoverTitle>
          <PopoverDescription>{children}</PopoverDescription>
        </PopoverContent>
      </Popover>
    </div>
  );
}
