import type { colorChart as colorChartZh } from "../zh/colorChart";

// 内容页暂无英文路由，按 ADR 0005 以中文占位维持 typeof 同构
export const colorChart: typeof colorChartZh = {
  metadata: {
    title: "拼豆色号对照表：MARD、COCO、漫漫、盼盼、咪小窝",
    description:
      "拼豆色号对照表，收录 MARD、COCO、漫漫、盼盼、咪小窝五家常用色号体系的跨品牌对照，支持按色号或颜色搜索，拼豆补豆、换品牌买豆时一查便知。",
  },
  breadcrumb: "色号对照表",
  hero: {
    title: "拼豆色号对照表",
    lead: "MARD、COCO、漫漫、盼盼、咪小窝五家色号体系的对照，可按色号或颜色搜索。",
  },
  disclaimer: "色块仅供视觉参考，实际颜色请以实物豆子为准。",
  breadcrumbHome: "首页",
  intro: {
    whatTitle: "什么是拼豆色号对照表",
    whatBody1:
      "MARD、COCO、漫漫、盼盼、咪小窝是五家常用的拼豆色号体系：同一颗颜色的豆子，在 MARD 可能叫 A01，在 COCO 可能叫 E02，各家的编号互不相同。",
    whatBody2:
      "这张表把五家的编号逐色并排，每行配一个参考色块。找到任一家的色号所在行，同一行就是其余四家的对应色号。",
    whenTitle: "什么时候需要查这张表",
    whenItems: [
      "买豆：图纸标注的色号体系和店铺卖的品牌不同，需要逐色换算。",
      "补豆：某个色号缺货或停产，想从其他品牌找同一颜色补上。",
      "换品牌：整套图纸从一家色号体系迁到另一家，按行批量对照。",
    ],
  },
  search: {
    label: "搜索色号",
    placeholder: "输入任一品牌的色号，如 A01 或 E02",
    hint: "五家色号都可以搜，大小写和首尾空格不影响结果。",
    clear: "清除搜索",
    countAll: (total: number) => `共 ${total} 色`,
    countMatched: (total: number, matched: number) => `共 ${total} 色 · 匹配 ${matched} 色`,
    emptyTitle: "没有找到匹配的色号",
    emptyText: "检查色号是否输入完整，或换一家品牌的色号再试。",
  },
  chart: {
    sectionTitle: "五家色号对照",
    swatchColumn: "色块",
    swatchAria: "参考色块，实际颜色以实物豆为准",
    brands: {
      mard: "MARD",
      coco: "COCO",
      manman: "漫漫",
      panpan: "盼盼",
      mixiaowo: "咪小窝",
    },
    groups: {
      red: "红色系",
      orange: "橙色系",
      yellow: "黄色系",
      yellowGreen: "黄绿色系",
      green: "绿色系",
      cyan: "青色系",
      blue: "蓝色系",
      purple: "紫色系",
      pink: "粉色系",
      brown: "棕色系",
      neutral: "灰白黑",
    },
    groupCount: (count: number) => `${count} 色`,
    tableAria: (groupName: string) => `${groupName}色号对照`,
    scrollHint: "表格较宽时，可左右滑动查看完整色号。",
  },
  usage: {
    title: "买豆时怎么用这张表",
    steps: [
      "先确认图纸或成品用的是哪家色号体系（比如 MARD），在对应列里找到色号。",
      "同一行就是其他四家的对应色号，按要下单的店铺品牌列抄下即可。",
      "屏幕上的色块只用来快速定位，下单前建议再对照店铺的实物色卡确认一次。",
    ],
  },
  toolLink: {
    title: "用生成器做图纸，色号自动匹配",
    bodyStart:
      "上传图片、选好色号体系，拼豆底稿生成器会自动把图片颜色匹配为对应色号，下载的制作底稿直接标注色号和用量。",
    tutorialLink: "拼豆图纸怎么画",
    bodyMiddle: "里有从零开始的完整步骤，作品做完后参考",
    ironingLink: "拼豆熨烫指南",
    bodyEnd: "熨烫定型。",
    cta: "免费生成拼豆图纸",
  },
};
