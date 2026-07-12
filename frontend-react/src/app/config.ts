// 产品版本与登录方式是两个独立维度。两版共用业务核心与授权码登录，
// edition 只负责品牌、发布通道和少量集中声明的永久能力差异。

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {};

export type AppEdition = "zhang" | "commercial";
export type AuthMode = "license";

export const APP_EDITION: AppEdition = env.VITE_EDITION?.trim() === "commercial" ? "commercial" : "zhang";

export const IS_COMMERCIAL = APP_EDITION === "commercial";

export const AUTH_MODE: AuthMode = "license";
export const USES_LICENSE_AUTH = AUTH_MODE === "license";

/** 应用显示名称。商用版可通过 VITE_APP_NAME 覆盖,默认给一个通用名。 */
export const APP_NAME =
  env.VITE_APP_NAME?.trim() ||
  (IS_COMMERCIAL ? "班级座位管理器" : "小张专用座位管理器");
