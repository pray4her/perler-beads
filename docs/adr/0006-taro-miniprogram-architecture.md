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

- 持久化走存储抽象层双实现：Web 端项目、恢复点、快照与专心模式进度继续使用 idb，当前色板设置使用 localStorage，旧 `focusMode_*` localStorage 数据只作为一次性迁移源；小程序端小数据（设置、专心模式进度）走 `wx.setStorage`（单 key 1MB、总 10MB 上限），网格数据与原图走 `USER_DATA_PATH` 文件并以 fflate 压缩落盘。组件与共享用例不得直接触达 idb 或 localStorage，旧数据读取由 Web adapter 的迁移能力封装；抽象层接口与现有持久化用法同形，两端各自实现。
- 平台适配层采用“客户端组合根 + 用例函数显式注入”：共享契约不依赖 React、DOM 或 Taro；Web 客户端入口装配 Web adapter，小程序入口装配 miniprogram adapter；需要行为测试的用例从参数接收最小能力接口并由 fake adapter 驱动。不使用 React Context 传递平台对象，避免把平台选择耦合到组件树或跨越 Next.js Server/Client 可序列化边界。
- 平台 seam 对外只有一个组合根，但由四个聚焦接口组成：项目持久化、文件选择与读取、Canvas 导出、产物保存。调用方按用例依赖所需的最小接口，避免形成包含所有平台方法的扁平大接口；Web 与小程序 adapter 分别组合这四类实现。
- 文件选择与读取接口使用平台无关的 `SelectedFileRef`，共享调用方不得看到浏览器 `File` 或小程序临时路径；Web adapter 负责包装文件选择和拖放得到的 `File`，小程序 adapter 负责包装 `wx.chooseMedia` 的临时文件。用户取消选择返回空结果而不是错误。Web 现有图片、CSV、色板 JSON、`.perler` 与参考图导入全部迁移到该接口，小程序 v1 只调用图片能力，不以公共接口为由强求功能对等。
- Canvas 导出返回平台无关且不透明的 `ArtifactRef`，产物保存接口只消费该引用；共享调用方不得判断 Web `Blob` 或小程序临时文件路径。Web adapter 可将 PNG、PDF、CSV、JSON 与 `.perler` 产物包装为 `ArtifactRef` 后下载，小程序 adapter 将 `canvasToTempFilePath` 的结果包装后交给 `saveImageToPhotosAlbum`。图片剪贴板复制是 Web adapter 的额外能力，不进入四类公共接口，也不要求小程序实现。编辑器 exporter 中的纯生产模型继续共享，依赖 DOM Canvas、jsPDF 或浏览器剪贴板的实现迁入 Web adapter。
- 触达浏览器 API 的依赖在小程序端均有替代或剔除：idb→存储抽象层；jspdf→见 ADR 0007（v1 无 PDF）；react-easy-crop/react-image-crop→image-editor；motion→CSS 动画；lucide-react→静态图标资源；next-pwa 整段不适用；fflate 为纯 JS 可直接复用。
- 编辑器触摸交互需重新设计：小程序无 pointer 事件模型，「工具操作」（按下到释放为一次可撤销操作）的边界判定要在触摸事件流上重建。
