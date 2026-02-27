import { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { Button } from "../ui/button";
import {
  LayoutDashboard, Cpu, Settings2, FileCode2,
  Rocket, History, Shield, Users, LogOut,
  ChevronLeft, ChevronRight, Radio
} from "lucide-react";
import { Toaster } from "../ui/sonner";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "developer", "viewer"] },
  { path: "/devices", label: "Devices", icon: Radio, roles: ["admin", "developer", "viewer"] },
  { path: "/pin-config", label: "Pin Config", icon: Cpu, roles: ["admin", "developer"] },
  { path: "/editor", label: "Code Editor", icon: FileCode2, roles: ["admin", "developer"] },
  { path: "/deploy", label: "Build & Deploy", icon: Rocket, roles: ["admin", "developer"] },
  { path: "/ota-history", label: "OTA History", icon: History, roles: ["admin", "developer", "viewer"] },
  { path: "/audit-log", label: "Audit Log", icon: Shield, roles: ["admin", "developer", "viewer"] },
  { path: "/settings", label: "Settings", icon: Users, roles: ["admin"] },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const filteredNav = NAV_ITEMS.filter((item) =>
    item.roles.includes(user?.role || "viewer")
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#09090b]" data-testid="app-layout">
      <Toaster theme="dark" position="top-right" richColors />
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border/50 bg-[#0c0a09] transition-all duration-200 ${
          collapsed ? "w-16" : "w-56"
        }`}
        data-testid="sidebar"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border/50">
          <div className="w-8 h-8 rounded-sm bg-primary/20 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-primary" strokeWidth={1.5} />
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm tracking-tight text-foreground">
              ESP32 Fleet
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {filteredNav.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-testid={`nav-${item.path.slice(1)}`}
                className={`flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-all ${
                  active
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border/50 p-2 space-y-1">
          {!collapsed && user && (
            <div className="px-3 py-2">
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              <p className="text-[10px] font-mono text-primary/70 uppercase tracking-wider">{user.role}</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            data-testid="logout-btn"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.5} />
            {!collapsed && "Logout"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            data-testid="toggle-sidebar-btn"
            className="w-full text-muted-foreground"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
