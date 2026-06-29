// 版本(edition)配置。
// 默认是"小张专用"版,行为与现状完全一致(本地密码登录、可改密码、离线可用)。
// 商用版在打包时设置环境变量 VITE_EDITION=commercial 来启用授权码登录。
//
// 本地构建 / GitHub Pages 默认不带 VITE_EDITION → 小张版,因此现有部署不受影响。

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {};

export type AppEdition = "zhang" | "commercial";

export const APP_EDITION: AppEdition = env.VITE_EDITION?.trim() === "commercial" ? "commercial" : "zhang";

export const IS_COMMERCIAL = APP_EDITION === "commercial";

/** 应用显示名称。商用版可通过 VITE_APP_NAME 覆盖,默认给一个通用名。 */
export const APP_NAME =
  env.VITE_APP_NAME?.trim() ||
  (IS_COMMERCIAL ? "班级座位管理器" : "小张专用座位管理器");
