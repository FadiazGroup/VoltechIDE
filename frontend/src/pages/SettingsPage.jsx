import { useState, useEffect } from "react";
import { usersAPI } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Users, Shield } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await usersAPI.list();
      setUsers(res.data);
    } catch (err) {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await usersAPI.updateRole(userId, newRole);
      toast.success("Role updated");
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update role");
    }
  };

  const ROLE_COLORS = {
    admin: { bg: "bg-[#ff3366]/10", text: "text-[#ff3366]", border: "border-[#ff3366]/30" },
    developer: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/30" },
    viewer: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
  };

  return (
    <div className="p-6 space-y-6" data-testid="settings-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">User management and RBAC configuration</p>
      </div>

      <Card className="bg-[#121212] border-border/50" data-testid="user-management-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Users className="w-4 h-4" strokeWidth={1.5} />
            User Management
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left p-3">User</th>
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3">Role</th>
                    <th className="text-left p-3">Joined</th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const rc = ROLE_COLORS[u.role] || ROLE_COLORS.viewer;
                    const isSelf = u.id === currentUser?.id;
                    return (
                      <tr key={u.id} className="border-b border-border/20 hover:bg-secondary/20 transition-colors" data-testid={`user-row-${u.id}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-sm bg-primary/10 flex items-center justify-center">
                              <Shield className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
                            </div>
                            <span className="font-medium">{u.name}</span>
                            {isSelf && <span className="text-[10px] text-primary font-mono">(you)</span>}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{u.email}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={`text-[10px] font-mono uppercase ${rc.text} ${rc.border}`}>
                            {u.role}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : "–"}
                        </td>
                        <td className="p-3">
                          {!isSelf ? (
                            <Select value={u.role} onValueChange={(v) => handleRoleChange(u.id, v)}>
                              <SelectTrigger data-testid={`role-select-${u.id}`} className="w-28 h-7 bg-transparent border-border/50 rounded-sm font-mono text-[10px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-[#121212] border-border/50">
                                <SelectItem value="admin" className="font-mono text-xs">Admin</SelectItem>
                                <SelectItem value="developer" className="font-mono text-xs">Developer</SelectItem>
                                <SelectItem value="viewer" className="font-mono text-xs">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* RBAC Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#121212] border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#ff3366]" />
              <span className="text-xs font-mono uppercase tracking-wider text-[#ff3366]">Admin</span>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>Full system access</li>
              <li>User management & RBAC</li>
              <li>All CRUD operations</li>
              <li>View all devices & logs</li>
            </ul>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-xs font-mono uppercase tracking-wider text-primary">Developer</span>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>Device management</li>
              <li>Pin configuration</li>
              <li>Code editing & builds</li>
              <li>Deploy & rollback OTA</li>
            </ul>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-muted-foreground" />
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Viewer</span>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>View device status</li>
              <li>View OTA history</li>
              <li>View audit logs</li>
              <li>Read-only access</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
