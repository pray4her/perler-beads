import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold text-foreground">页面不存在</h1>
      <p className="text-sm text-muted-foreground">请返回首页继续使用拼豆底稿生成器。</p>
      <Button variant="outline" render={<Link href="/" />} className="mt-2">
        返回首页
      </Button>
    </main>
  );
}
