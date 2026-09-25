import type { ReactNode } from "react";
import { DrawerDock, ModalShell } from "./ui";

interface AppShellProps {
  header: ReactNode;
  sidebar: ReactNode;
  mainTabs?: ReactNode;
  children: ReactNode;
  overlays?: ReactNode;
  sidebarCollapsed: boolean;
  isMobile: boolean;
  mobileNavigationOpen: boolean;
  onCloseMobileNavigation: () => void;
}

export function AppShell({ header, sidebar, mainTabs, children, overlays, sidebarCollapsed, isMobile, mobileNavigationOpen, onCloseMobileNavigation }: AppShellProps) {
  return (
    <div className="app-shell h-dvh flex flex-col overflow-hidden bg-[var(--app-bg)]">
      {header}

      <div className="app-shell-body flex-1 min-h-0 flex gap-3 overflow-hidden p-3">
        {!isMobile && <div
          className="min-h-0 shrink-0 overflow-hidden transition-[width] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width]"
          style={{
            width: sidebarCollapsed ? 64 : 212,
          }}
        >
          {sidebar}
        </div>}

        <div className="app-work-surface flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
          {mainTabs}
          <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
        </div>
        {!isMobile && <DrawerDock />}
      </div>

      {isMobile && <ModalShell open={mobileNavigationOpen} title="切换工作区" onClose={onCloseMobileNavigation} className="app-mobile-navigation max-w-sm">{sidebar}</ModalShell>}
      {overlays}
    </div>
  );
}
