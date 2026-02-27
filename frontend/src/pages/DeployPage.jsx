import { useState, useEffect, useRef, useCallback } from "react";
import { buildsAPI, deploymentsAPI, projectsAPI, devicesAPI } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Checkbox } from "../components/ui/checkbox";
import { ScrollArea } from "../components/ui/scroll-area";
import { Rocket, Terminal, Package, Play, Loader2, PauseCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export default function DeployPage() {
  const [projects, setProjects] = useState([]);
  const [devices, setDevices] = useState([]);
  const [builds, setBuilds] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [activeBuild, setActiveBuild] = useState(null);
  const [buildLogs, setBuildLogs] = useState([]);
  const [buildPolling, setBuildPolling] = useState(false);

  // Deploy state
  const [selectedBuild, setSelectedBuild] = useState("");
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [rolloutPercent, setRolloutPercent] = useState("100");
  const [deploying, setDeploying] = useState(false);
  const terminalRef = useRef(null);

  useEffect(() => {
    projectsAPI.list().then((r) => setProjects(r.data)).catch(() => {});
    devicesAPI.list().then((r) => setDevices(r.data)).catch(() => {});
    buildsAPI.list().then((r) => setBuilds(r.data)).catch(() => {});
  }, []);

  const pollBuild = useCallback(async (buildId) => {
    setBuildPolling(true);
    const poll = async () => {
      try {
        const res = await buildsAPI.get(buildId);
        const build = res.data;
        setBuildLogs(build.logs || []);
        setActiveBuild(build);
        if (build.status === "building" || build.status === "queued") {
          setTimeout(poll, 2000);
        } else {
          setBuildPolling(false);
          buildsAPI.list().then((r) => setBuilds(r.data));
          if (build.status === "success") {
            toast.success("Build completed successfully!");
          } else {
            toast.error("Build failed");
          }
        }
      } catch {
        setBuildPolling(false);
      }
    };
    poll();
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [buildLogs]);

  const handleBuild = async () => {
    if (!selectedProject || !version) return;
    try {
      const res = await buildsAPI.trigger({ project_id: selectedProject, target_version: version });
      setActiveBuild(res.data);
      setBuildLogs(res.data.logs || []);
      toast.success("Build started");
      pollBuild(res.data.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Build failed");
    }
  };

  const handleDeploy = async () => {
    if (!selectedBuild || selectedDevices.length === 0) return;
    setDeploying(true);
    try {
      await deploymentsAPI.create({
        build_id: selectedBuild,
        target_device_ids: selectedDevices,
        rollout_percent: parseInt(rolloutPercent),
        rollout_strategy: parseInt(rolloutPercent) < 100 ? "canary" : "immediate",
      });
      toast.success("Deployment created");
      setSelectedDevices([]);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const toggleDevice = (deviceId) => {
    setSelectedDevices((prev) =>
      prev.includes(deviceId) ? prev.filter((id) => id !== deviceId) : [...prev, deviceId]
    );
  };

  const successBuilds = builds.filter((b) => b.status === "success");

  return (
    <div className="p-6 space-y-6" data-testid="deploy-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Build & Deploy</h1>
        <p className="text-sm text-muted-foreground mt-1">Compile firmware and deploy via OTA</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Build Section */}
        <div className="space-y-4">
          <Card className="bg-[#121212] border-border/50" data-testid="build-section">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Package className="w-4 h-4" strokeWidth={1.5} />Build Firmware
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Project</Label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger data-testid="build-project-select" className="bg-transparent border-border/50 rounded-sm font-mono text-xs">
                    <SelectValue placeholder="Select project..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#121212] border-border/50">
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="font-mono text-xs">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Version (semver)</Label>
                <Input
                  data-testid="build-version-input"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0.0"
                  className="bg-transparent border-border/50 rounded-sm font-mono"
                />
              </div>
              <Button
                onClick={handleBuild}
                disabled={!selectedProject || buildPolling}
                data-testid="build-trigger-btn"
                className="w-full rounded-sm bg-primary/10 border border-primary/50 text-primary font-mono uppercase tracking-wider text-xs"
              >
                {buildPolling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                {buildPolling ? "Building..." : "Start Build"}
              </Button>
            </CardContent>
          </Card>

          {/* Build Terminal */}
          <Card className="bg-[#050505] border-border/50" data-testid="build-terminal">
            <CardHeader className="pb-1 pt-3 px-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-[#00ff9d]" strokeWidth={1.5} />
                <span className="text-[10px] font-mono text-[#00ff9d] uppercase tracking-wider">Build Output</span>
                {buildPolling && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                {activeBuild && (
                  <Badge variant="outline" className={`ml-auto text-[10px] font-mono ${
                    activeBuild.status === "success" ? "border-[#00ff9d]/50 text-[#00ff9d]" :
                    activeBuild.status === "building" || activeBuild.status === "queued" ? "border-primary/50 text-primary" :
                    "border-[#ff3366]/50 text-[#ff3366]"
                  }`}>
                    {activeBuild.status}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div ref={terminalRef} className="h-56 overflow-y-auto px-3 pb-3 terminal-text" data-testid="terminal-output">
                {buildLogs.length === 0 ? (
                  <p className="text-muted-foreground/50 py-4">$ waiting for build...</p>
                ) : (
                  buildLogs.map((log, i) => (
                    <div key={i} className="text-[#00ff9d]/80">
                      <span className="text-muted-foreground/50">$</span> {log}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Deploy Section */}
        <div className="space-y-4">
          <Card className="bg-[#121212] border-border/50" data-testid="deploy-section">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Rocket className="w-4 h-4" strokeWidth={1.5} />Deploy OTA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Build Artifact</Label>
                <Select value={selectedBuild} onValueChange={setSelectedBuild}>
                  <SelectTrigger data-testid="deploy-build-select" className="bg-transparent border-border/50 rounded-sm font-mono text-xs">
                    <SelectValue placeholder="Select build..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#121212] border-border/50">
                    {successBuilds.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="font-mono text-xs">
                        {b.project_name} v{b.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Rollout Strategy</Label>
                <Select value={rolloutPercent} onValueChange={setRolloutPercent}>
                  <SelectTrigger data-testid="rollout-select" className="bg-transparent border-border/50 rounded-sm font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#121212] border-border/50">
                    <SelectItem value="5" className="font-mono text-xs">Canary 5%</SelectItem>
                    <SelectItem value="20" className="font-mono text-xs">Canary 20%</SelectItem>
                    <SelectItem value="50" className="font-mono text-xs">50%</SelectItem>
                    <SelectItem value="100" className="font-mono text-xs">Immediate 100%</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Target Devices</Label>
                <ScrollArea className="h-[180px] border border-border/30 rounded-sm p-2">
                  {devices.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No devices available</p>
                  ) : (
                    devices.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 py-1.5 px-2 hover:bg-secondary/30 rounded-sm" data-testid={`deploy-device-${d.id}`}>
                        <Checkbox
                          checked={selectedDevices.includes(d.id)}
                          onCheckedChange={() => toggleDevice(d.id)}
                          data-testid={`deploy-checkbox-${d.id}`}
                        />
                        <span className="text-xs font-mono">{d.name}</span>
                        <div className={`w-1.5 h-1.5 rounded-full ml-auto ${d.status === "online" ? "bg-[#00ff9d]" : "bg-[#52525b]"}`} />
                      </div>
                    ))
                  )}
                </ScrollArea>
              </div>

              <Button
                onClick={handleDeploy}
                disabled={!selectedBuild || selectedDevices.length === 0 || deploying}
                data-testid="deploy-btn"
                className="w-full rounded-sm bg-[#00ff9d]/10 border border-[#00ff9d]/50 text-[#00ff9d] font-mono uppercase tracking-wider text-xs hover:bg-[#00ff9d]/20"
              >
                {deploying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Rocket className="w-4 h-4 mr-2" />}
                Deploy to {selectedDevices.length} device{selectedDevices.length !== 1 ? "s" : ""}
              </Button>
            </CardContent>
          </Card>

          {/* Recent Builds */}
          <Card className="bg-[#121212] border-border/50" data-testid="recent-builds">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Recent Builds</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[200px]">
                {builds.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No builds yet</p>
                ) : (
                  builds.slice(0, 10).map((b) => (
                    <div key={b.id} className="flex items-center justify-between px-4 py-2 border-b border-border/20 text-xs" data-testid={`build-row-${b.id}`}>
                      <div>
                        <span className="font-mono text-foreground">{b.project_name}</span>
                        <span className="text-muted-foreground ml-2">v{b.version}</span>
                      </div>
                      <Badge variant="outline" className={`text-[10px] font-mono ${
                        b.status === "success" ? "border-[#00ff9d]/50 text-[#00ff9d]" :
                        b.status === "building" ? "border-primary/50 text-primary" :
                        b.status === "queued" ? "border-[#ffb000]/50 text-[#ffb000]" :
                        "border-[#ff3366]/50 text-[#ff3366]"
                      }`}>
                        {b.status}
                      </Badge>
                    </div>
                  ))
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
