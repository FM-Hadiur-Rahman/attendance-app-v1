// src/api/checkin_checkout.ts
import axiosInstance from "./axiosInstance";

interface LocationPayload {
  latitude: string;
  longitude: string;
}

type GetTodayOpts = {
userId?: string;
branchId?: string;
timezone?: string; // default 'Asia/Colombo'
};

export const startAttendance = async (payload: LocationPayload) => {
  try {
    const response = await axiosInstance.post("/attendance/start", payload);
    return response.data;
  } catch (error: any) {
    console.error("❌ Check-in API error:", error.response?.data || error.message);
    throw error;
  }
};

export const endAttendance = async (payload: LocationPayload) => {
  try {
    const response = await axiosInstance.post("/attendance/end", payload);
    return response.data;
  } catch (error: any) {
    console.error("❌ Check-out API error:", error.response?.data || error.message);
    throw error;
  }
};


export const getTodaySchedule = async (opts: { userId?: string; branchId?: string; timezone?: string } = {}) => {
  const { userId, branchId, timezone = "Asia/Colombo" } = opts;

  const todayInTZ = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  console.log("📅 Looking for schedule on:", todayInTZ);

  let page = 1;
  const limit = 20;
  let totalPages = 1;
  let allSchedules: any[] = [];

  try {
    while (page <= totalPages) {
      const resp = await axiosInstance.get("/schedule/", { params: { page, limit } });
      const schedules: any[] = resp.data?.schedules ?? resp.data?.data ?? [];
      allSchedules = allSchedules.concat(schedules);

      if (resp.data.totalPages) totalPages = resp.data.totalPages;
      else if (resp.data.total && resp.data.limit) totalPages = Math.ceil(resp.data.total / resp.data.limit);

      // check if today exists in this page
      const todaySchedule = schedules.find((s: any) => {
        if (!s?.date) return false;
        const schedDate = new Date(s.date).toLocaleDateString("en-CA", { timeZone: timezone });
        return schedDate === todayInTZ;
      });

      if (todaySchedule) {
        // optional filter by user/branch
        if (userId && todaySchedule.employee_id?._id !== userId) return { schedules: allSchedules, todaySchedule: null };
        if (branchId && todaySchedule.branch_id?._id !== branchId) return { schedules: allSchedules, todaySchedule: null };

        return {
          schedules: allSchedules,
          todaySchedule: {
            branchname: todaySchedule.branch_id?.name ?? "Unknown Branch",
            start_time: todaySchedule.start_time,
            end_time: todaySchedule.end_time,
            raw: todaySchedule,
          },
        };
      }

      page++;
      if (page > 50) break; // safety
    }

    return { schedules: allSchedules, todaySchedule: null };
  } catch (err: any) {
    console.error("❌ getTodaySchedule failed:", err.response?.data ?? err.message);
    return { schedules: allSchedules, todaySchedule: null };
  }
};

export const getBranchDetails = async (branchId: string) => {
  try {
    const response = await axiosInstance.get("/branch"); // fetch all branches
    const branch = response.data.branches.find(
      (b: any) => b._id === branchId
    );
    if (!branch) throw new Error("Branch not found");
    return branch;
  } catch (error) {
    console.log("❌ Error fetching branch address:", error);
    throw error;
  }
};



