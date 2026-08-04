interface JsonLdProps {
  data: Record<string, unknown>;
}

/** 注入 JSON-LD 结构化数据（服务端渲染进静态 HTML） */
export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
