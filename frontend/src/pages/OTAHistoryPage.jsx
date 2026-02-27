import { useState, useEffect } from "react";
import { deploymentsAPI } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { History, RotateCcw, PauseCircle, Play, ChevronRight, Package } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS = {
  active: { border: "border-[#00ff9d]/50", text: "text-[#00ff9d]" },
  paused: { border: "border-[#ffb000]/50", text: "text-[#ffb000]" },
  rolled_back: { border: "border-[#ff3366]/50", text: "text-[#ff3366]" },
  completed: { border: "border-primary/50", text: "text-primary" },
};

export default function OTAHistoryPage() {
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeploy, setSelectedDeploy] = useState(null);
  const [rollbackReason, setRollbackReason] = useState("");

  useEffect(() => { loadDeployments(); }, []);

  const loadDeployments = async () => {
    try {
      const res = await deploymentsAPI.list();
      setDeployments(res.data);
    } catch {
      toast.error("Failed to load deployments");
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (id) => {
    try {
      await deploymentsAPI.rollback(id, rollbackReason);
      toast.success("Deployment rolled back");
      setRollbackReason("");
      setSelectedDeploy(null);
      loadDeployments();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Rollback failed");
    }
  };

  const handlePause = async (id) => {
    try {
      await deploymentsAPI.pause(id);
      toast.success("Deployment paused");
      loadDeployments();
    } catch {
      toast.error("Failed to pause");
    }
  };

  const handleResume = async (id) => {
    try {
      await deploymentsAPI.resume(id);
      toast.success("Deployment resumed");
      loadDeployments();
    } catch {
      toast.error("Failed to resume");
    }
  };

  const handleUpdateRollout = async (id, percent) => {
    try {
      await deploymentsAPI.updateRollout(id, parseInt(percent));
      toast.success(`Rollout updated to ${percent}%`);
      loadDeployments();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update rollout");
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="ota-history-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">OTA History</h1>
        <p className="text-sm text-muted-foreground mt-1">Deployment history and rollout management</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : deployments.length === 0 ? (
        <Card className="bg-[#121212] border-border/50 border-dashed">
          <CardContent className="py-12 text-center">
            <History className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" strokeWidth={1} />
            <p className="text-muted-foreground">No deployments yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {deployments.map((deploy) => {
            const sc = STATUS_COLORS[deploy.status] || STATUS_COLORS.active;
            const deviceCount = deploy.target_device_ids?.length || 0;
            const deviceStatuses = deploy.device_statuses || {};
            const successCount = Object.values(deviceStatuses).filter((s) => s === "success").length;

            return (
              <Card key={deploy.id} className="bg-[#121212] border-border/50" data-testid={`deploy-card-${deploy.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center">
                        <Package className="w-5 h-5 text-primary" strokeWidth={1.5} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{deploy.project_name || "Unknown"}</span>
                          <span className="font-mono text-xs text-primary">v{deploy.version}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="font-mono">{new Date(deploy.created_at).toLocaleString()}</span>
                          <span>{deviceCount} device{deviceCount !== 1 ? "s" : ""}</span>
                          <span>Rollout: {deploy.rollout_percent}%</span>
                          {successCount > 0 && <span className="text-[#00ff9d]">{successCount} applied</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] font-mono ${sc.border} ${sc.text}`}>
                        {deploy.status}
                      </Badge>

                      {deploy.status === "active" && (
                        <>
                          <Select onValueChange={(v) => handleUpdateRollout(deploy.id, v)}>
                            <SelectTrigger data-testid={`rollout-update-${deploy.id}`} className="w-24 h-7 bg-transparent border-border/50 rounded-sm font-mono text-[10px]">
                              <SelectValue placeholder={`${deploy.rollout_percent}%`} />
                            </SelectTrigger>
                            <SelectContent className="bg-[#121212] border-border/50">
                              <SelectItem value="5" className="font-mono text-xs">5%</SelectItem>
                              <SelectItem value="20" className="font-mono text-xs">20%</SelectItem>
                              <SelectItem value="50" className="font-mono text-xs">50%</SelectItem>
                              <SelectItem value="100" className="font-mono text-xs">100%</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePause(deploy.id)}
                            data-testid={`pause-deploy-${deploy.id}`}
                            className="h-7 w-7 text-[#ffb000] hover:bg-[#ffb000]/10"
                          >
                            <PauseCircle className="w-4 h-4" strokeWidth={1.5} />
                          </Button>
                        </>
                      )}

                      {deploy.status === "paused" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleResume(deploy.id)}
                          data-testid={`resume-deploy-${deploy.id}`}
                          className="h-7 w-7 text-[#00ff9d] hover:bg-[#00ff9d]/10"
                        >
                          <Play className="w-4 h-4" strokeWidth={1.5} />
                        </Button>
                      )}

                      {(deploy.status === "active" || deploy.status === "paused") && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`rollback-deploy-${deploy.id}`}
                              className="h-7 w-7 text-[#ff3366] hover:bg-[#ff3366]/10"
                            >
                              <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-[#121212] border-border/50">
                            <DialogHeader>
                              <DialogTitle>Rollback Deployment</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason</Label>
                                <Input
                                  data-testid={`rollback-reason-${deploy.id}`}
                                  value={rollbackReason}
                                  onChange={(e) => setRollbackReason(e.target.value)}
                                  placeholder="Reason for rollback..."
                                  className="bg-transparent border-border/50 rounded-sm font-mono"
                                />
                              </div>
                              <Button
                                onClick={() => handleRollback(deploy.id)}
                                data-testid={`rollback-confirm-${deploy.id}`}
                                className="w-full rounded-sm bg-[#ff3366]/10 border border-[#ff3366]/50 text-[#ff3366] font-mono uppercase text-xs"
                              >
                                Confirm Rollback
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
