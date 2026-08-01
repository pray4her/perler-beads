import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">页面不存在</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">请返回首页继续使用拼豆底稿生成器。</p>
      <Link
        href="/"
        className="mt-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
      >
        返回首页
      </Link>
    </main>
  );
}
