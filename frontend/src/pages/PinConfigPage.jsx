import { useState, useEffect, useCallback } from "react";
import { pinAPI, devicesAPI } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { ScrollArea } from "../components/ui/scroll-area";
import { Cpu, Save, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";

const PIN_COLORS = {
  UNASSIGNED: "#52525b",
  GPIO_INPUT: "#00f0ff",
  GPIO_OUTPUT: "#00f0ff",
  ADC: "#ffb000",
  PWM: "#a855f7",
  I2C_SDA: "#00ff9d",
  I2C_SCL: "#00ff9d",
  SPI_MOSI: "#3b82f6",
  SPI_MISO: "#3b82f6",
  SPI_SCK: "#3b82f6",
  SPI_CS: "#3b82f6",
  UART_TX: "#f97316",
  UART_RX: "#f97316",
  I2S_BCLK: "#ec4899",
  I2S_WS: "#ec4899",
  I2S_DATA: "#ec4899",
};

export default function PinConfigPage() {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [boardProfile, setBoardProfile] = useState(null);
  const [pinAssignments, setPinAssignments] = useState({});
  const [validation, setValidation] = useState({ valid: true, errors: [], warnings: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    devicesAPI.list().then((r) => setDevices(r.data)).catch(() => {});
    pinAPI.getBoardProfile().then((r) => setBoardProfile(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedDevice) {
      pinAPI.getConfig(selectedDevice).then((r) => {
        setPinAssignments(r.data.pins || {});
      }).catch(() => {});
    }
  }, [selectedDevice]);

  const validatePins = useCallback(async (pins) => {
    try {
      const res = await pinAPI.validate(pins);
      setValidation(res.data);
    } catch {
      // ignore
    }
  }, []);

  const handlePinChange = (pinNum, func) => {
    const updated = { ...pinAssignments, [String(pinNum)]: func };
    setPinAssignments(updated);
    validatePins(updated);
  };

  const handleSave = async () => {
    if (!selectedDevice) return;
    setSaving(true);
    try {
      const res = await pinAPI.updateConfig(selectedDevice, pinAssignments);
      setValidation(res.data.validation || { valid: true, errors: [], warnings: [] });
      toast.success("Pin configuration saved");
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail?.errors) {
        setValidation(detail);
        toast.error("Validation failed: " + detail.errors.join(", "));
      } else {
        toast.error("Failed to save configuration");
      }
    } finally {
      setSaving(false);
    }
  };

  const pins = boardProfile?.pins || [];
  const functions = boardProfile?.functions || {};

  // Layout: ESP32-C3 QFN32 - split pins into left/right columns
  const leftPins = pins.filter((p) => p.number <= 10);
  const rightPins = pins.filter((p) => p.number > 10);

  return (
    <div className="p-6 space-y-6" data-testid="pin-config-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pin Configurator</h1>
          <p className="text-sm text-muted-foreground mt-1">Visual pin assignment for ESP32-C3</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedDevice} onValueChange={setSelectedDevice}>
            <SelectTrigger data-testid="pin-device-select" className="w-[220px] bg-transparent border-border/50 rounded-sm font-mono text-xs">
              <SelectValue placeholder="Select device..." />
            </SelectTrigger>
            <SelectContent className="bg-[#121212] border-border/50">
              {devices.map((d) => (
                <SelectItem key={d.id} value={d.id} className="font-mono text-xs">{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleSave}
            disabled={!selectedDevice || saving}
            data-testid="save-pin-config-btn"
            className="rounded-sm bg-primary/10 border border-primary/50 text-primary font-mono uppercase tracking-wider text-xs"
          >
            <Save className="w-4 h-4 mr-2" strokeWidth={1.5} />
            {saving ? "Saving..." : "Save Config"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chip Visualization */}
        <div className="lg:col-span-8">
          <Card className="bg-[#121212] border-border/50" data-testid="chip-visual">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Cpu className="w-4 h-4" strokeWidth={1.5} />
                ESP32-C3 QFN32 Package
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 justify-center items-stretch">
                {/* Left pins */}
                <div className="flex flex-col gap-1 justify-center">
                  {leftPins.map((pin) => (
                    <PinRow key={pin.number} pin={pin} side="left" assignment={pinAssignments[String(pin.number)] || "UNASSIGNED"} functions={functions} onChange={handlePinChange} />
                  ))}
                </div>

                {/* Chip body */}
                <div className="relative w-48 bg-[#1a1a2e] border-2 border-[#27272a] rounded flex flex-col items-center justify-center py-8">
                  <div className="absolute top-2 left-2 w-3 h-3 rounded-full border border-primary/40" />
                  <Cpu className="w-10 h-10 text-primary/30 mb-2" strokeWidth={1} />
                  <span className="text-[10px] font-mono text-primary/50 tracking-wider">ESP32-C3</span>
                  <span className="text-[9px] font-mono text-muted-foreground mt-1">QFN32 5x5mm</span>
                </div>

                {/* Right pins */}
                <div className="flex flex-col gap-1 justify-center">
                  {rightPins.map((pin) => (
                    <PinRow key={pin.number} pin={pin} side="right" assignment={pinAssignments[String(pin.number)] || "UNASSIGNED"} functions={functions} onChange={handlePinChange} />
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-border/30">
                {Object.entries(PIN_COLORS).filter(([k]) => k !== "UNASSIGNED").map(([key, color]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                    <span className="text-[10px] font-mono text-muted-foreground">{key}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Validation Panel */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="bg-[#121212] border-border/50" data-testid="validation-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Validation</CardTitle>
            </CardHeader>
            <CardContent>
              {validation.valid ? (
                <div className="flex items-center gap-2 text-[#00ff9d]">
                  <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
                  <span className="text-sm">Configuration valid</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {validation.errors?.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-[#ff3366] text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.5} />
                      <span>{e}</span>
                    </div>
                  ))}
                </div>
              )}
              {validation.warnings?.length > 0 && (
                <div className="mt-3 space-y-2">
                  {validation.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-[#ffb000] text-xs">
                      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.5} />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pin Summary */}
          <Card className="bg-[#121212] border-border/50" data-testid="pin-summary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Pin Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <div className="space-y-1">
                  {pins.map((pin) => {
                    const func = pinAssignments[String(pin.number)] || "UNASSIGNED";
                    return (
                      <div key={pin.number} className="flex items-center justify-between py-1 px-2 rounded-sm hover:bg-secondary/30 text-xs">
                        <span className="font-mono text-muted-foreground">{pin.name}</span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono"
                          style={{ borderColor: `${PIN_COLORS[func]}50`, color: PIN_COLORS[func] }}
                        >
                          {func === "UNASSIGNED" ? "—" : func}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PinRow({ pin, side, assignment, functions, onChange }) {
  const color = PIN_COLORS[assignment] || PIN_COLORS.UNASSIGNED;
  const isAssigned = assignment !== "UNASSIGNED";

  const content = (
    <div
      className={`flex items-center gap-2 ${side === "right" ? "flex-row-reverse" : ""}`}
      data-testid={`pin-row-${pin.number}`}
    >
      {/* Pin label */}
      <span className={`text-[10px] font-mono w-16 ${side === "right" ? "text-left" : "text-right"} ${isAssigned ? "text-foreground" : "text-muted-foreground"}`}>
        {pin.name}
      </span>

      {/* Pin dot */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="w-5 h-5 rounded-sm border transition-all hover:scale-125 focus:outline-none focus:ring-1 focus:ring-primary"
            style={{
              background: `${color}20`,
              borderColor: `${color}60`,
              boxShadow: isAssigned ? `0 0 6px ${color}40` : "none",
            }}
            data-testid={`pin-btn-${pin.number}`}
          />
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 bg-[#121212] border-border/50" side={side === "left" ? "right" : "left"}>
          <div className="space-y-1">
            <p className="text-xs font-mono text-primary mb-2">{pin.name}</p>
            {pin.strapping && (
              <p className="text-[10px] text-[#ffb000] flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Strapping pin
              </p>
            )}
            <p className="text-[10px] text-muted-foreground mb-2">{pin.notes}</p>
            {pin.available_functions?.map((func) => (
              <button
                key={func}
                onClick={() => onChange(pin.number, func)}
                data-testid={`pin-func-${pin.number}-${func}`}
                className={`w-full text-left px-2 py-1 rounded-sm text-xs font-mono transition-colors ${
                  assignment === func
                    ? "bg-primary/20 text-primary"
                    : "hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="inline-block w-2 h-2 rounded-sm mr-2" style={{ background: PIN_COLORS[func] }} />
                {functions[func]?.label || func}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Function badge */}
      <span className={`text-[9px] font-mono w-16 ${side === "right" ? "text-right" : "text-left"}`} style={{ color }}>
        {isAssigned ? assignment : ""}
      </span>
    </div>
  );

  return content;
}
