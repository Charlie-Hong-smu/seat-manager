import type { ReactNode } from "react";

export function WorkspacePanel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-separator-border px-5 py-4">
        <h2 className="text-headline-regular text-text-primary" style={{ fontWeight: 900 }}>{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
