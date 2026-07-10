import { Component, Suspense, createElement, lazy, useMemo, useState, type ComponentType, type ErrorInfo, type ReactNode } from "react";

class LazyErrorBoundary extends Component<{
  children: ReactNode;
  resetKey: number;
  onRetry: () => void;
}, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Lazy feature failed to load", { message: error.message, componentStack: info.componentStack });
  }

  componentDidUpdate(previous: Readonly<{ resetKey: number }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-48 items-center justify-center bg-gray-50 p-6">
          <div className="max-w-sm rounded-2xl border border-red-100 bg-white p-5 text-center shadow-sm">
            <p className="text-sm font-bold text-gray-800">功能模块加载失败</p>
            <p className="mt-2 text-xs leading-5 text-gray-500">网络恢复后可直接重试，当前班级数据不会被清空。</p>
            <button type="button" onClick={this.props.onRetry} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">重新加载模块</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function FeatureSkeleton() {
  return (
    <div className="h-full animate-pulse space-y-4 bg-gray-50 p-5" aria-label="正在加载功能模块">
      <div className="h-12 rounded-2xl bg-gray-200/80" />
      <div className="grid h-[calc(100%-4rem)] grid-cols-[16rem_1fr] gap-4">
        <div className="rounded-2xl bg-gray-200/70" />
        <div className="rounded-2xl bg-gray-200/60" />
      </div>
    </div>
  );
}

export function RetryableLazy<P extends object>({ load, componentProps, fallback = <FeatureSkeleton /> }: {
  load: () => Promise<{ default: ComponentType<P> }>;
  componentProps: P;
  fallback?: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const LazyComponent = useMemo(() => lazy(() => {
    void attempt;
    return load();
  }), [attempt, load]);
  return (
    <LazyErrorBoundary resetKey={attempt} onRetry={() => setAttempt((value) => value + 1)}>
      <Suspense fallback={fallback}>{createElement(
        LazyComponent as unknown as ComponentType<Record<string, unknown>>,
        componentProps as unknown as Record<string, unknown>,
      )}</Suspense>
    </LazyErrorBoundary>
  );
}
