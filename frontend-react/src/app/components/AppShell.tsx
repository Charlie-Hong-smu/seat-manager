import type { ReactNode } from "react";

interface AppShellProps {
  header: ReactNode;
  sidebar: ReactNode;
  mainTabs?: ReactNode;
  children: ReactNode;
  overlays?: ReactNode;
  sidebarCollapsed: boolean;
}

export function AppShell({ header, sidebar, mainTabs, children, overlays, sidebarCollapsed }: AppShellProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--app-bg)]">
      {header}

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div
          className="min-h-0 shrink-0 overflow-hidden transition-[width] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width]"
          style={{
            width: sidebarCollapsed ? 64 : 200,
          }}
        >
          {sidebar}
        </div>

        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
          {mainTabs}
          <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
        </div>
      </div>

      {overlays}
    </div>
  );
}
