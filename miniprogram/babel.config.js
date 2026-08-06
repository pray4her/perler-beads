// babel-preset-taro 与 @tarojs/cli 同版本（4.2.1）
module.exports = {
  presets: [
    [
      "taro",
      {
        framework: "react",
        ts: true,
        compiler: "webpack5",
      },
    ],
  ],
};
