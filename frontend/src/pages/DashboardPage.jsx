import { useState, useEffect } from "react";
import { telemetryAPI } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Radio, Wifi, WifiOff, Cpu, HardDrive, Activity } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

const COLORS = ["#00f0ff", "#00ff9d", "#ffb000", "#ff3366", "#a855f7"];

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await telemetryAPI.dashboard();
      setData(res.data);
    } catch (err) {
      console.error("Failed to load dashboard", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const fwData = data?.firmware_versions
    ? Object.entries(data.firmware_versions).map(([name, value]) => ({ name, value }))
    : [];

  const devices = data?.devices || [];

  return (
    <div className="p-6 space-y-6" data-testid="dashboard-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fleet Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time overview of your ESP32 device fleet</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[#121212] border-border/50" data-testid="stat-total-devices">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Devices</p>
                <p className="text-3xl font-bold font-mono mt-1">{data?.total_devices || 0}</p>
              </div>
              <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center">
                <Radio className="w-5 h-5 text-primary" strokeWidth={1.5} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#121212] border-border/50" data-testid="stat-online">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Online</p>
                <p className="text-3xl font-bold font-mono mt-1 text-[#00ff9d]">{data?.online || 0}</p>
              </div>
              <div className="w-10 h-10 rounded-sm bg-[#00ff9d]/10 flex items-center justify-center">
                <Wifi className="w-5 h-5 text-[#00ff9d]" strokeWidth={1.5} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#121212] border-border/50" data-testid="stat-offline">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Offline</p>
                <p className="text-3xl font-bold font-mono mt-1 text-[#ff3366]">{data?.offline || 0}</p>
              </div>
              <div className="w-10 h-10 rounded-sm bg-[#ff3366]/10 flex items-center justify-center">
                <WifiOff className="w-5 h-5 text-[#ff3366]" strokeWidth={1.5} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#121212] border-border/50" data-testid="stat-avg-rssi">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Avg RSSI</p>
                <p className="text-3xl font-bold font-mono mt-1">{data?.avg_rssi || 0} <span className="text-sm text-muted-foreground">dBm</span></p>
              </div>
              <div className="w-10 h-10 rounded-sm bg-[#ffb000]/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-[#ffb000]" strokeWidth={1.5} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Firmware Distribution */}
        <Card className="bg-[#121212] border-border/50" data-testid="firmware-chart">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Firmware Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {fwData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={fwData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {fwData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#121212", border: "1px solid #27272a", fontSize: 12, fontFamily: "JetBrains Mono" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No devices registered</div>
            )}
            <div className="flex flex-wrap gap-3 mt-2">
              {fwData.map((fw, i) => (
                <div key={fw.name} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-xs font-mono text-muted-foreground">v{fw.name} ({fw.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Device Health */}
        <Card className="bg-[#121212] border-border/50" data-testid="health-chart">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Device Health (Free Heap)</CardTitle>
          </CardHeader>
          <CardContent>
            {devices.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={devices.slice(0, 10).map(d => ({ name: d.name?.substring(0, 8) || "?", heap: d.free_heap || 0 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                  <YAxis tick={{ fill: "#a1a1aa", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                  <Tooltip contentStyle={{ background: "#121212", border: "1px solid #27272a", fontSize: 12, fontFamily: "JetBrains Mono" }} />
                  <Bar dataKey="heap" fill="#00f0ff" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No telemetry data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Device List */}
      <Card className="bg-[#121212] border-border/50" data-testid="device-list-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Device Fleet</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left p-3">Device</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Firmware</th>
                  <th className="text-left p-3">RSSI</th>
                  <th className="text-left p-3">Free Heap</th>
                  <th className="text-left p-3">Last Seen</th>
                  <th className="text-left p-3">OTA Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-6 text-center text-muted-foreground">No devices yet. Go to Devices page to add one.</td>
                  </tr>
                ) : (
                  devices.map((d) => (
                    <tr key={d.id} className="border-b border-border/30 hover:bg-secondary/30 transition-colors" data-testid={`device-row-${d.id}`}>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-primary/70" strokeWidth={1.5} />
                          <div>
                            <p className="font-medium text-foreground">{d.name}</p>
                            <p className="text-xs font-mono text-muted-foreground">{d.board_type}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${d.status === "online" ? "bg-[#00ff9d] status-pulse" : "bg-[#52525b]"}`} style={{ color: d.status === "online" ? "#00ff9d" : "#52525b" }} />
                          <span className={`text-xs font-mono ${d.status === "online" ? "text-[#00ff9d]" : "text-muted-foreground"}`}>{d.status}</span>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs">{d.firmware_version}</td>
                      <td className="p-3 font-mono text-xs">{d.rssi || "–"} dBm</td>
                      <td className="p-3 font-mono text-xs">{d.free_heap ? `${(d.free_heap / 1024).toFixed(1)}KB` : "–"}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{d.last_seen ? new Date(d.last_seen).toLocaleString() : "Never"}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-[10px] font-mono ${
                          d.last_ota_status === "success" ? "border-[#00ff9d]/50 text-[#00ff9d]" :
                          d.last_ota_status === "pending" ? "border-[#ffb000]/50 text-[#ffb000]" :
                          d.last_ota_status === "failed" ? "border-[#ff3366]/50 text-[#ff3366]" :
                          "border-border text-muted-foreground"
                        }`}>
                          {d.last_ota_status || "none"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
