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
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {header}

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div
          className="min-h-0 shrink-0 overflow-hidden transition-[width,opacity] duration-[320ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]"
          style={{
            width: sidebarCollapsed ? 0 : 160,
            opacity: sidebarCollapsed ? 0 : 1,
          }}
          aria-hidden={sidebarCollapsed}
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
