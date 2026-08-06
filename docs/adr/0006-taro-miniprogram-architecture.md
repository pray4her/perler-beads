# 微信小程序以 miniprogram/ 独立 Taro 工程落地

微信小程序不能运行 Next.js 应用（无 DOM/BOM），经评估 web-view 内嵌与 Taro 重构两条路线后，选择 Taro 重构：小程序页面与交互用 Taro 组件重新实现，获得原生体验且不受 web-view 的非个人主体门槛限制。Taro 工程放在仓库内 `miniprogram/` 子目录，自带独立 `package.json` 与 lockfile，与根目录 Next.js 工具链完全隔离（不用 npm workspaces，避免两个构建系统争抢 babel/PostCSS/tsconfig）。纯逻辑（`src/utils/`、`src/editor/`、色号数据、i18n 字典）通过 Taro webpack alias 直引根目录源码，保持单一事实源；Web 端与小程序端共用一份像素化、颜色映射与编辑器操作逻辑。画布采用单张 `<Canvas type="2d">` 整帧重绘，fill/stats/risks 计算保留在 Worker（`Taro.createWorker`）中，仅改写通信层。UI 层全部重写：shadcn/base-ui/Tailwind 运行时均不可用，采用 weapp-tailwindcss 保留 Tailwind 类名工作流 + 按设计自写组件。原图整理的裁剪/旋转交互用小程序原生 `<image-editor>` 组件承载，不自写裁剪框。

## Considered Options

- **web-view 内嵌 H5**：零重写，但要求非个人主体 + 业务域名 ICP 备案（当前域名托管 Cloudflare 无法备案），且 PWA、下载、分享等能力在 web-view 内全部受限。
- **uni-app**：Vue 栈，与本项目 React 19 + TypeScript 技术栈不符，迁移等于换语言重写。
- **npm workspaces / 根目录混入 Taro**：依赖提升或共存会让 Next 15 与 Taro 的构建链互相污染，隔离收益大于依赖统一收益。
- **复制代码到 miniprogram/**：零配置，但色号数据与像素化逻辑必然两端漂移。
- **多层 Canvas 分层渲染**：大图纸高频拖动更顺，但层间同步是新复杂度，首版单 Canvas 重绘已够用。
- **movable-view 自写裁剪**：交互可与 Web 端完全对齐，但手势冲突与边界计算是编辑器之外第二大工程；原生 image-editor 已覆盖裁剪/旋转需求。

## Consequences

- 持久化走存储抽象层双实现：Web 端继续 idb；小程序端小数据（设置、专心模式进度）走 `wx.setStorage`（单 key 1MB、总 10MB 上限），网格数据与原图走 `USER_DATA_PATH` 文件并以 fflate 压缩落盘。抽象层接口与 idb 同形，两端各自实现。
- 触达浏览器 API 的依赖在小程序端均有替代或剔除：idb→存储抽象层；jspdf→见 ADR 0007（v1 无 PDF）；react-easy-crop/react-image-crop→image-editor；motion→CSS 动画；lucide-react→静态图标资源；next-pwa 整段不适用；fflate 为纯 JS 可直接复用。
- 编辑器触摸交互需重新设计：小程序无 pointer 事件模型，「工具操作」（按下到释放为一次可撤销操作）的边界判定要在触摸事件流上重建。
