import { useEffect, useRef } from "react";

// 跨页定位统一为 consume-once：同一个目标 key 只应用一次，应用后通知上层回收；
// 之后业务数据变化不再重复应用，避免覆盖用户手动调整的筛选、搜索与选中状态。
// targetKey 变回空时重置，允许下一次跳转到相同对象。
export function useInitialTargetEffect(targetKey: string | undefined, apply: () => void, onConsumed?: () => void) {
  const consumedKeyRef = useRef<string | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const onConsumedRef = useRef(onConsumed);
  onConsumedRef.current = onConsumed;
  useEffect(() => {
    if (!targetKey) {
      consumedKeyRef.current = null;
      return;
    }
    if (consumedKeyRef.current === targetKey) {
      return;
    }
    consumedKeyRef.current = targetKey;
    applyRef.current();
    onConsumedRef.current?.();
  }, [targetKey]);
}
