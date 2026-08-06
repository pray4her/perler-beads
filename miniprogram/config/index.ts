import path from "node:path";
import { defineConfig, type UserConfigExport } from "@tarojs/cli";
import { WeappTailwindcss } from "weapp-tailwindcss/webpack";

import devConfig from "./dev";
import prodConfig from "./prod";

const projectRoot = path.resolve(__dirname, "..");
// 仓库根目录 src/：共享纯逻辑（utils / editor / i18n / types），见 ADR 0006
const sharedSrcRoot = path.resolve(projectRoot, "..", "src");
const sharedSrcRootNormalized = sharedSrcRoot.replace(/\\/g, "/");

const weappTailwindcssOptions = {
  cssOptions: {
    rem2rpx: true,
  },
  tailwindcssBasedir: projectRoot,
  cssEntries: [path.resolve(projectRoot, "src/app.css")],
};

// https://taro.zone/docs/config-detail
export default defineConfig<"webpack5">(async (merge) => {
  const baseConfig: UserConfigExport<"webpack5"> = {
    projectName: "perler-beads-miniprogram",
    date: "2026-8-6",
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: "src",
    outputRoot: "dist",
    plugins: [],
    defineConstants: {},
    copy: {
      patterns: [],
      options: {},
    },
    framework: "react",
    compiler: "webpack5",
    cache: {
      enable: false,
    },
    mini: {
      compile: {
        // 让 Taro 的 babel 编译链覆盖仓库根目录的共享 TS 源码
        include: [
          (filename: string) =>
            filename.replace(/\\/g, "/").startsWith(sharedSrcRootNormalized),
        ],
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: "module",
            generateScopedName: "[name]__[local]___[hash:base64:5]",
          },
        },
      },
      webpackChain(chain) {
        // @shared/* -> 仓库根目录 src/*（小程序侧类型映射见 tsconfig paths）
        chain.resolve.alias.set("@shared", sharedSrcRoot);
        chain.merge({
          plugin: {
            install: {
              plugin: WeappTailwindcss,
              args: [weappTailwindcssOptions],
            },
          },
        });
      },
    },
  };
  if (process.env.NODE_ENV === "development") {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
});
