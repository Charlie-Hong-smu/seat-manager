import type { AppEdition } from "./config";
import { APP_EDITION } from "./config";

export interface EditionCapabilities {
  /** 最新 main 自动进入 Zhang，Commercial 只能由已验证提交晋升。 */
  earlyAccessChannel: boolean;
  /** 永久只面向内部/个人的入口必须通过此能力集中控制。 */
  personalTools: boolean;
  /** 生产 Commercial 构建不得暴露内部诊断入口。 */
  internalDiagnostics: boolean;
}

export const EDITION_CAPABILITIES: Readonly<Record<AppEdition, EditionCapabilities>> = Object.freeze({
  zhang: Object.freeze({ earlyAccessChannel: true, personalTools: true, internalDiagnostics: true }),
  commercial: Object.freeze({ earlyAccessChannel: false, personalTools: false, internalDiagnostics: false }),
});

export const editionCapabilities = EDITION_CAPABILITIES[APP_EDITION];
