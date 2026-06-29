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
        {!sidebarCollapsed && sidebar}

        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
          {mainTabs}
          <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
        </div>
      </div>

      {overlays}
    </div>
  );
}
