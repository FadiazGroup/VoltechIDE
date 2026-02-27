import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { projectsAPI, templatesAPI } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Plus, Save, FileCode2, Trash2, FolderOpen, Wifi, Radio, Cpu } from "lucide-react";
import { toast } from "sonner";

export default function EditorPage() {
  const [projects, setProjects] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeFile, setActiveFile] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("blank");
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);

  useEffect(() => {
    loadProjects();
    templatesAPI.list().then((r) => setTemplates(r.data)).catch(() => {});
  }, []);

  const loadProjects = async () => {
    try {
      const res = await projectsAPI.list();
      setProjects(res.data);
    } catch {
      toast.error("Failed to load projects");
    }
  };

  const selectProject = async (projectId) => {
    try {
      const res = await projectsAPI.get(projectId);
      setSelectedProject(res.data);
      setActiveFile(0);
    } catch {
      toast.error("Failed to load project");
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      const res = await projectsAPI.create({ name: newProjectName, board_type: "ESP32-C3" });
      toast.success("Project created");
      setShowCreate(false);
      setNewProjectName("");
      await loadProjects();
      setSelectedProject(res.data);
      setActiveFile(0);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create project");
    }
  };

  const handleSave = async () => {
    if (!selectedProject) return;
    setSaving(true);
    try {
      await projectsAPI.update(selectedProject.id, selectedProject.files);
      toast.success("Project saved");
    } catch {
      toast.error("Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  const handleEditorChange = (value) => {
    if (!selectedProject || activeFile < 0) return;
    const updated = { ...selectedProject };
    updated.files = [...updated.files];
    updated.files[activeFile] = { ...updated.files[activeFile], content: value || "" };
    setSelectedProject(updated);
  };

  const addFile = () => {
    if (!selectedProject) return;
    const name = prompt("File name (e.g., sensor.c):");
    if (!name) return;
    const updated = {
      ...selectedProject,
      files: [...selectedProject.files, { name, content: `// ${name}\n` }],
    };
    setSelectedProject(updated);
    setActiveFile(updated.files.length - 1);
  };

  const deleteFile = (index) => {
    if (!selectedProject || selectedProject.files.length <= 1) return;
    const updated = {
      ...selectedProject,
      files: selectedProject.files.filter((_, i) => i !== index),
    };
    setSelectedProject(updated);
    setActiveFile(Math.max(0, activeFile - 1));
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    if (!window.confirm("Delete this project?")) return;
    try {
      await projectsAPI.delete(selectedProject.id);
      toast.success("Project deleted");
      setSelectedProject(null);
      loadProjects();
    } catch {
      toast.error("Failed to delete project");
    }
  };

  const currentFile = selectedProject?.files?.[activeFile];

  return (
    <div className="flex flex-col h-full" data-testid="editor-page">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-border/50 bg-[#0c0a09]">
        <div className="flex items-center gap-3">
          <Select value={selectedProject?.id || ""} onValueChange={selectProject}>
            <SelectTrigger data-testid="project-select" className="w-[200px] h-8 bg-transparent border-border/50 rounded-sm font-mono text-xs">
              <SelectValue placeholder="Select project..." />
            </SelectTrigger>
            <SelectContent className="bg-[#121212] border-border/50">
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id} className="font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-3 h-3" />
                    {p.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" data-testid="new-project-btn" className="h-8 text-xs font-mono text-muted-foreground hover:text-foreground">
                <Plus className="w-3.5 h-3.5 mr-1" />New
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#121212] border-border/50">
              <DialogHeader>
                <DialogTitle>New Project</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateProject} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Project Name</Label>
                  <Input
                    data-testid="new-project-name-input"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g., sensor-firmware"
                    className="bg-transparent border-border/50 rounded-sm font-mono"
                    required
                  />
                </div>
                <Button type="submit" data-testid="create-project-submit-btn" className="w-full rounded-sm bg-primary/10 border border-primary/50 text-primary font-mono uppercase text-xs">
                  Create Project
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center gap-2">
          {selectedProject && (
            <>
              <Button variant="ghost" size="sm" onClick={addFile} data-testid="add-file-btn" className="h-8 text-xs font-mono text-muted-foreground">
                <Plus className="w-3.5 h-3.5 mr-1" />File
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDeleteProject} data-testid="delete-project-btn" className="h-8 text-xs text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                data-testid="save-project-btn"
                className="h-8 rounded-sm bg-primary/10 border border-primary/50 text-primary font-mono uppercase tracking-wider text-xs"
              >
                <Save className="w-3.5 h-3.5 mr-1" />{saving ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      {!selectedProject ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileCode2 className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" strokeWidth={1} />
            <p className="text-muted-foreground">Select or create a project to start coding</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* File Tabs */}
          <div className="flex items-center border-b border-border/50 bg-[#0c0a09] overflow-x-auto">
            {selectedProject.files.map((file, i) => (
              <button
                key={i}
                onClick={() => setActiveFile(i)}
                data-testid={`file-tab-${i}`}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-mono border-r border-border/30 transition-colors ${
                  i === activeFile
                    ? "bg-[#121212] text-primary border-b-2 border-b-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                }`}
              >
                <FileCode2 className="w-3 h-3" strokeWidth={1.5} />
                {file.name}
                {selectedProject.files.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteFile(i); }}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                  >
                    &times;
                  </button>
                )}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language="c"
              theme="vs-dark"
              value={currentFile?.content || ""}
              onChange={handleEditorChange}
              onMount={(editor) => { editorRef.current = editor; }}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                lineNumbers: "on",
                renderLineHighlight: "gutter",
                scrollBeyondLastLine: false,
                padding: { top: 8 },
                automaticLayout: true,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
