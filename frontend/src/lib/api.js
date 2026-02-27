import axios from "axios";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  me: () => api.get("/auth/me"),
};

// Devices
export const devicesAPI = {
  list: () => api.get("/devices"),
  create: (data) => api.post("/devices", data),
  get: (id) => api.get(`/devices/${id}`),
  delete: (id) => api.delete(`/devices/${id}`),
  claim: (code) => api.post("/devices/claim", { claim_code: code }),
};

// Pin Config
export const pinAPI = {
  getBoardProfile: () => api.get("/board-profile"),
  getConfig: (deviceId) => api.get(`/devices/${deviceId}/pins`),
  updateConfig: (deviceId, pins) => api.put(`/devices/${deviceId}/pins`, { pins }),
  validate: (pins) => api.post("/pins/validate", { pins }),
};

// Projects
export const projectsAPI = {
  list: () => api.get("/projects"),
  create: (data) => api.post("/projects", data),
  get: (id) => api.get(`/projects/${id}`),
  update: (id, files) => api.put(`/projects/${id}`, { files }),
  delete: (id) => api.delete(`/projects/${id}`),
};

// Templates
export const templatesAPI = {
  list: () => api.get("/templates"),
  get: (id) => api.get(`/templates/${id}`),
};

// Builds
export const buildsAPI = {
  trigger: (data) => api.post("/builds", data),
  list: () => api.get("/builds"),
  get: (id) => api.get(`/builds/${id}`),
};

// Deployments
export const deploymentsAPI = {
  create: (data) => api.post("/deployments", data),
  list: () => api.get("/deployments"),
  get: (id) => api.get(`/deployments/${id}`),
  rollback: (id, reason) => api.post(`/deployments/${id}/rollback`, { reason }),
  pause: (id) => api.post(`/deployments/${id}/pause`),
  resume: (id) => api.post(`/deployments/${id}/resume`),
  updateRollout: (id, percent) => api.put(`/deployments/${id}/rollout?rollout_percent=${percent}`),
};

// Telemetry
export const telemetryAPI = {
  dashboard: () => api.get("/telemetry/dashboard"),
  device: (id) => api.get(`/telemetry/${id}`),
};

// Audit Logs
export const auditAPI = {
  list: (limit = 100) => api.get(`/audit-logs?limit=${limit}`),
};

// Users
export const usersAPI = {
  list: () => api.get("/users"),
  updateRole: (id, role) => api.put(`/users/${id}/role`, { role }),
};

export default api;
