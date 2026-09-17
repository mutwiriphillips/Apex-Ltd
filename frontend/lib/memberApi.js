import axios from "axios";

// Deliberately separate from lib/api.js: member tokens are stored under a
// different localStorage key and are never sent on staff API calls (and
// vice versa) — mirrors the backend's separate authenticate/authenticateMember
// middleware and separate JWT "type" claims.
const memberApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api",
});

memberApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("embu_member_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

memberApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (typeof window !== "undefined" && err?.response?.status === 401) {
      window.localStorage.removeItem("embu_member_token");
      window.localStorage.removeItem("embu_member_profile");
      if (window.location.pathname !== "/member/login") {
        window.location.href = "/member/login";
      }
    }
    return Promise.reject(err);
  }
);

export default memberApi;
