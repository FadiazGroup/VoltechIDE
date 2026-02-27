import { useState } from "react";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Cpu, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await login(form.email, form.password);
        toast.success("Logged in successfully");
      } else {
        await register(form.email, form.password, form.name);
        toast.success("Account created successfully");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#09090b] grid-bg" data-testid="auth-page">
      {/* Left side - branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 border-r border-border/30">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-sm bg-primary/20 flex items-center justify-center glow-cyan">
              <Cpu className="w-6 h-6 text-primary" strokeWidth={1.5} />
            </div>
            <span className="text-xl font-semibold tracking-tight">ESP32 Fleet Manager</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
            <span className="text-foreground">Manage your</span>
            <br />
            <span className="text-primary text-glow-cyan">IoT fleet</span>
            <br />
            <span className="text-foreground">with precision</span>
          </h1>
          <p className="mt-6 text-muted-foreground max-w-md text-base">
            Pin configuration, OTA deployment, telemetry monitoring.
            Built for ESP32-C3 embedded engineers.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00ff9d]" />
            Visual Pin Configurator (like STM32CubeMX)
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            OTA Firmware Deployment with Staged Rollout
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-[#ffb000]" />
            Real-time Device Telemetry Dashboard
          </div>
        </div>
      </div>

      {/* Right side - auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md bg-[#121212] border-border/50" data-testid="auth-card">
          <CardHeader className="text-center pb-2">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
              <Cpu className="w-6 h-6 text-primary" strokeWidth={1.5} />
              <span className="font-semibold">ESP32 Fleet Manager</span>
            </div>
            <CardTitle className="text-xl tracking-tight">
              {isLogin ? "Sign In" : "Create Account"}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {isLogin ? "Access your device fleet" : "Start managing your ESP32 devices"}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
                  <Input
                    id="name"
                    data-testid="auth-name-input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    className="bg-transparent border-border/50 rounded-sm font-mono focus:border-primary"
                    required={!isLogin}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="auth-email-input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="engineer@company.com"
                  className="bg-transparent border-border/50 rounded-sm font-mono focus:border-primary"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  data-testid="auth-password-input"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 6 characters"
                  className="bg-transparent border-border/50 rounded-sm font-mono focus:border-primary"
                  required
                />
              </div>
              <Button
                type="submit"
                data-testid="auth-submit-btn"
                disabled={loading}
                className="w-full rounded-sm bg-primary/10 border border-primary/50 text-primary hover:bg-primary/20 font-mono uppercase tracking-widest text-xs h-10"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {isLogin ? "Sign In" : "Create Account"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                data-testid="auth-toggle-btn"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {isLogin ? "Need an account? Register" : "Already have an account? Sign In"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
