import { useState, useEffect } from "react";
import { auditAPI } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";
import { Shield, User, Radio, Package, FileCode2, Rocket, Settings } from "lucide-react";

const ACTION_ICONS = {
  register: User,
  login: User,
  create_device: Radio,
  delete_device: Radio,
  claim_device: Radio,
  update_pin_config: Settings,
  create_project: FileCode2,
  update_project: FileCode2,
  delete_project: FileCode2,
  trigger_build: Package,
  create_deployment: Rocket,
  rollback_deployment: Rocket,
  pause_deployment: Rocket,
  resume_deployment: Rocket,
  update_rollout: Rocket,
  update_role: User,
};

const ACTION_COLORS = {
  register: "#00f0ff",
  login: "#00f0ff",
  create_device: "#00ff9d",
  delete_device: "#ff3366",
  claim_device: "#ffb000",
  update_pin_config: "#a855f7",
  create_project: "#00ff9d",
  update_project: "#ffb000",
  delete_project: "#ff3366",
  trigger_build: "#00f0ff",
  create_deployment: "#00ff9d",
  rollback_deployment: "#ff3366",
  pause_deployment: "#ffb000",
  resume_deployment: "#00ff9d",
  update_rollout: "#ffb000",
  update_role: "#a855f7",
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auditAPI.list(200).then((r) => setLogs(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6" data-testid="audit-log-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">Complete activity history across your fleet</p>
      </div>

      <Card className="bg-[#121212] border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center">
              <Shield className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" strokeWidth={1} />
              <p className="text-muted-foreground">No audit logs yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left p-3 w-12"></th>
                    <th className="text-left p-3">Action</th>
                    <th className="text-left p-3">User</th>
                    <th className="text-left p-3">Resource</th>
                    <th className="text-left p-3">Details</th>
                    <th className="text-left p-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const Icon = ACTION_ICONS[log.action] || Shield;
                    const color = ACTION_COLORS[log.action] || "#52525b";
                    return (
                      <tr key={log.id} className="border-b border-border/20 hover:bg-secondary/20 transition-colors" data-testid={`audit-row-${log.id}`}>
                        <td className="p-3">
                          <div className="w-7 h-7 rounded-sm flex items-center justify-center" style={{ background: `${color}15` }}>
                            <Icon className="w-3.5 h-3.5" style={{ color }} strokeWidth={1.5} />
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px] font-mono" style={{ borderColor: `${color}50`, color }}>
                            {log.action}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{log.user_email}</td>
                        <td className="p-3">
                          <span className="text-xs text-muted-foreground">{log.resource_type}</span>
                          <span className="text-[10px] font-mono text-muted-foreground/50 ml-1 truncate max-w-[120px] inline-block align-middle">{log.resource_id?.substring(0, 8)}...</span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">{log.details || "–"}</td>
                        <td className="p-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
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
    </div>
  );
}
