import { View, Text } from "@tarojs/components";
// 通过 @shared alias 直引仓库根目录共享 i18n 字典（纯数据，无 React/context 依赖）
// 验证 alias + mini.compile.include 链路，见 ADR 0006
import { common } from "@shared/i18n/dictionaries/zh/common";
import "./index.css";

export default function Index() {
  return (
    <View className="flex min-h-screen flex-col items-center justify-center gap-4 bg-amber-50 p-8">
      <Text className="text-3xl font-bold text-stone-900">拼豆底稿生成工具</Text>
      <Text className="text-base text-stone-600">
        微信小程序版脚手架已就绪
      </Text>
      <View className="mt-6 rounded-xl bg-white px-6 py-4 shadow-md">
        <Text className="text-sm text-stone-500">
          共享 i18n 字典（@shared/i18n）：{common.loading} / {common.confirm} /{" "}
          {common.cancel}
        </Text>
      </View>
    </View>
  );
}
