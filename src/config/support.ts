export interface SupportConfig {
  wechatQrSrc: string | null;
  alipayQrSrc: string | null;
}

/**
 * 将两张收款码放入 public/support/ 后，在这里填写以 / 开头的路径。
 * 只有微信和支付宝收款码都配置完成时，首页支持入口才会显示。
 */
export const supportConfig: SupportConfig = {
  wechatQrSrc: null,
  alipayQrSrc: null,
};

export function isSupportConfigured(config: SupportConfig): config is {
  wechatQrSrc: string;
  alipayQrSrc: string;
} {
  return Boolean(config.wechatQrSrc && config.alipayQrSrc);
}
