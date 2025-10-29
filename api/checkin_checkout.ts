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

export const getWeeklySchedules = async (opts: { userId?: string; timezone?: string } = {}) => {
  const { userId, timezone = "Asia/Colombo" } = opts;

  const today = new Date();
  const day = today.getDay();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - day);
  sunday.setHours(0, 0, 0, 0);

  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);

  try {
    const resp = await axiosInstance.get("/schedule", { params: { page: 1, limit: 100 } });
    const allSchedules = resp.data?.schedules ?? resp.data?.data ?? [];

    const weekSchedules = allSchedules.filter((s: any) => {
      const schedDate = new Date(s.date);
      return schedDate >= sunday && schedDate <= saturday &&
        (!userId || s.employee_id?._id === userId);
    });

    // 🧠 Debug log for your user’s weekly schedule
    if (userId) {
      console.log("📆 Weekly Schedules for User:", userId,);
      weekSchedules.forEach((s: any) => {
        console.log(
          `➡️ ${s.day_of_week} (${new Date(s.date).toLocaleDateString("en-CA", { timeZone: timezone })})`,
          `| Branch: ${s.branch_id?.name}`,
          `| ${s.start_time} - ${s.end_time}`
        );
      });

      if (weekSchedules.length === 0) {
        console.log("⚠️ No schedules found for this user in the current week.");
      }
    }

  
return weekSchedules.map((s: any) => ({
  id: s._id,
  userId: s.employee_id?._id,
  username: s.employee_id?.username,
  branchId: s.branch_id?._id,       // schedule branch ID
  branchName: s.branch_id?.name,    // schedule branch name
  date: s.date,
  start_time: s.start_time,
  end_time: s.end_time,
  day_of_week: s.day_of_week,
  raw: s,
}));

  } catch (err: any) {
    console.error("❌ getWeeklySchedules failed:", err.response?.data ?? err.message);
    return [];
  }
};




