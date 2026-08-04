import type { contentPages as contentPagesZh } from "../zh/contentPages";

// 内容页暂无英文路由，按 ADR 0005 以中文占位维持 typeof 同构
export const contentPages: typeof contentPagesZh = {
  breadcrumbLabel: "面包屑导航",
  guidesNavLabel: "实用指南导航",
  nav: {
    home: "返回首页",
    tutorial: "图纸教程",
    colorChart: "色号对照表",
    ironingGuide: "熨烫指南",
  },
  cta: {
    generate: "免费生成拼豆图纸",
    backHome: "返回首页",
  },
  related: {
    title: "继续了解",
    tutorial: {
      title: "拼豆图纸怎么画",
      desc: "手绘、表格软件与在线生成器三种方法对比，附工具步骤截图。",
    },
    colorChart: {
      title: "拼豆色号对照表",
      desc: "MARD、COCO、漫漫、盼盼、咪小窝五家色号可搜索对照。",
    },
    ironingGuide: {
      title: "拼豆熨烫指南",
      desc: "温度档位、单双面烫与烫坏补救，常见问题一次讲清。",
    },
  },
};
