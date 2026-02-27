import { useState, useEffect } from "react";
import { devicesAPI } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Plus, Trash2, Link2, Cpu, Copy, Radio } from "lucide-react";
import { toast } from "sonner";

export default function DevicesPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [newDevice, setNewDevice] = useState({ name: "", board_type: "ESP32-C3", mac_address: "" });
  const [claimCode, setClaimCode] = useState("");

  useEffect(() => { loadDevices(); }, []);

  const loadDevices = async () => {
    try {
      const res = await devicesAPI.list();
      setDevices(res.data);
    } catch (err) {
      toast.error("Failed to load devices");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await devicesAPI.create(newDevice);
      toast.success("Device created");
      setShowCreate(false);
      setNewDevice({ name: "", board_type: "ESP32-C3", mac_address: "" });
      loadDevices();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create device");
    }
  };

  const handleClaim = async (e) => {
    e.preventDefault();
    try {
      await devicesAPI.claim(claimCode);
      toast.success("Device claimed successfully");
      setShowClaim(false);
      setClaimCode("");
      loadDevices();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid claim code");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this device?")) return;
    try {
      await devicesAPI.delete(id);
      toast.success("Device deleted");
      loadDevices();
    } catch (err) {
      toast.error("Failed to delete device");
    }
  };

  const canEdit = user?.role === "admin" || user?.role === "developer";

  return (
    <div className="p-6 space-y-6" data-testid="devices-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Devices</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your ESP32 device fleet</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Dialog open={showClaim} onOpenChange={setShowClaim}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="claim-device-btn" className="rounded-sm border-border/50 text-xs font-mono uppercase tracking-wider">
                  <Link2 className="w-4 h-4 mr-2" strokeWidth={1.5} />Claim Device
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#121212] border-border/50">
                <DialogHeader>
                  <DialogTitle>Claim Device</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleClaim} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pairing Code</Label>
                    <Input
                      data-testid="claim-code-input"
                      value={claimCode}
                      onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                      placeholder="ABC123"
                      className="bg-transparent border-border/50 rounded-sm font-mono text-center text-2xl tracking-[0.5em]"
                      maxLength={6}
                      required
                    />
                  </div>
                  <Button type="submit" data-testid="claim-submit-btn" className="w-full rounded-sm bg-primary/10 border border-primary/50 text-primary font-mono uppercase text-xs">
                    Claim Device
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button data-testid="create-device-btn" className="rounded-sm bg-primary/10 border border-primary/50 text-primary font-mono uppercase tracking-wider text-xs">
                  <Plus className="w-4 h-4 mr-2" strokeWidth={1.5} />Add Device
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#121212] border-border/50">
                <DialogHeader>
                  <DialogTitle>Add New Device</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Device Name</Label>
                    <Input
                      data-testid="device-name-input"
                      value={newDevice.name}
                      onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                      placeholder="e.g., Sensor Node Alpha"
                      className="bg-transparent border-border/50 rounded-sm font-mono"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Board Type</Label>
                    <Select value={newDevice.board_type} onValueChange={(v) => setNewDevice({ ...newDevice, board_type: v })}>
                      <SelectTrigger data-testid="board-type-select" className="bg-transparent border-border/50 rounded-sm font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#121212] border-border/50">
                        <SelectItem value="ESP32-C3">ESP32-C3</SelectItem>
                        <SelectItem value="ESP32">ESP32 (Classic)</SelectItem>
                        <SelectItem value="ESP32-S3">ESP32-S3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">MAC Address (optional)</Label>
                    <Input
                      data-testid="mac-address-input"
                      value={newDevice.mac_address}
                      onChange={(e) => setNewDevice({ ...newDevice, mac_address: e.target.value })}
                      placeholder="AA:BB:CC:DD:EE:FF"
                      className="bg-transparent border-border/50 rounded-sm font-mono"
                    />
                  </div>
                  <Button type="submit" data-testid="create-device-submit-btn" className="w-full rounded-sm bg-primary/10 border border-primary/50 text-primary font-mono uppercase text-xs">
                    Create Device
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Device Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : devices.length === 0 ? (
        <Card className="bg-[#121212] border-border/50 border-dashed">
          <CardContent className="py-12 text-center">
            <Radio className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" strokeWidth={1} />
            <p className="text-muted-foreground">No devices registered yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Add Device" to register your first ESP32</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <Card key={device.id} className="bg-[#121212] border-border/50 hover:border-primary/30 transition-colors" data-testid={`device-card-${device.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    <CardTitle className="text-sm font-medium">{device.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${device.status === "online" ? "bg-[#00ff9d] status-pulse" : "bg-[#52525b]"}`} style={{ color: device.status === "online" ? "#00ff9d" : "#52525b" }} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Board</p>
                    <p className="font-mono">{device.board_type}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Firmware</p>
                    <p className="font-mono">v{device.firmware_version}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">RSSI</p>
                    <p className="font-mono">{device.rssi || "–"} dBm</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Heap</p>
                    <p className="font-mono">{device.free_heap ? `${(device.free_heap / 1024).toFixed(1)}KB` : "–"}</p>
                  </div>
                </div>

                {device.claim_code && (
                  <div className="flex items-center gap-2 p-2 rounded-sm bg-[#ffb000]/10 border border-[#ffb000]/20">
                    <span className="text-[10px] text-[#ffb000] uppercase tracking-wider">Claim Code:</span>
                    <span className="font-mono text-sm text-[#ffb000] font-bold tracking-wider">{device.claim_code}</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(device.claim_code); toast.success("Copied!"); }}
                      className="ml-auto text-[#ffb000]/70 hover:text-[#ffb000]"
                      data-testid={`copy-claim-${device.id}`}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <Badge variant="outline" className={`text-[10px] font-mono ${
                    device.last_ota_status === "success" ? "border-[#00ff9d]/50 text-[#00ff9d]" :
                    device.last_ota_status === "pending" ? "border-[#ffb000]/50 text-[#ffb000]" :
                    "border-border text-muted-foreground"
                  }`}>
                    OTA: {device.last_ota_status || "none"}
                  </Badge>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(device.id)}
                      data-testid={`delete-device-${device.id}`}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
