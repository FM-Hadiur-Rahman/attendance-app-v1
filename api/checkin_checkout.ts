// src/api/check in_checkout.ts
import axiosInstance from "./axiosInstance";
import { ScheduleItem } from "./schedules";

interface LocationPayload {
  latitude: string;
  longitude: string;
  branchId: string;
}

type GetTodayOpts = {
  userId?: string;
  branchId?: string;
  timezone?: string; // default 'Asia/Colombo'
};

export interface ScheduleResponse {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  schedules: ScheduleItem[];
}

export interface AttendanceRecord {
  employeeId: string;
  username: string;
  fullname: string;
  date: string;
  scheduledStart: string;
  scheduledEnd: string;
  actualIn: string;
  actualOut: string;
  branchId: string;
  branchName: string;
  startStatus: string;
  endStatus: string;
}

export interface AttendanceReportItem {
  employeeId: string;
  username?: string;
  fullname?: string;
  date?: string; // YYYY-MM-DD
  scheduledStart?: string;
  scheduledEnd?: string;
  actualIn?: string | null;
  actualOut?: string | null;
  branchId?: string;
  branchName?: string;
  startStatus?: string | null;
  endStatus?: string | null;
}

// Helper function to calculate duration between two times (HH:MM format)
const calcDuration = (startTime: string, endTime: string): { h: number; m: number } => {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let h = eh - sh;
  let m = em - sm;
  if (m < 0) {
    m += 60;
    h--;
  }
  if (h < 0) h += 24;
  return { h, m };
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
      page++;
      if (page > 50) break; // safety
    }
    // Find today's schedule after fetching all pages
    const todaySchedule = allSchedules.find((s: any) => {
      if (!s?.date) return false;
      const schedDate = new Date(s.date!).toLocaleDateString("en-CA", { timeZone: timezone });
      return schedDate === todayInTZ;
    });
    if (todaySchedule) {
      // Optional filter by user/branch
      if (userId && (typeof todaySchedule.employee_id === 'object' && todaySchedule.employee_id !== null ? todaySchedule.employee_id._id : todaySchedule.employee_id) !== userId) return { schedules: allSchedules, todaySchedule: null };
      if (branchId && (typeof todaySchedule.branch_id === 'object' && todaySchedule.branch_id !== null ? todaySchedule.branch_id._id : todaySchedule.branch_id) !== branchId) return { schedules: allSchedules, todaySchedule: null };
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
    return { schedules: allSchedules, todaySchedule: null };
  } catch (err: any) {
    console.error("❌ getTodaySchedule failed:", err.response?.data ?? err.message);
    return { schedules: allSchedules, todaySchedule: null };
  }
};

export const getBranchDetails = async (branchId: string) => {
  try {
    const response = await axiosInstance.get(`/branch/${branchId}`);
    const branch = response.data?.branch || response.data?.data || response.data;
    if (!branch) throw new Error("Branch not found");

    let address: string | null = null;
    if (typeof branch.address === "string") {
      address = branch.address;
    } else if (branch.location?.coordinates) {
      const [lon, lat] = branch.location.coordinates;
      address = `Coordinates: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    } else {
      address = "Address not available";
    }

    return {
      id: branch._id,
      name: branch.name,
      address,
      phone: branch.phone || "N/A",
      email: branch.email || "N/A",
      raw: branch,
      location: branch.location || null, // ✅ include location here
    };
  } catch (error: any) {
    console.error("❌ Error fetching branch details:", error.response?.data || error.message);
    return null;
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
      if (!s?.date) return false;
      const schedDate = new Date(s.date!);
      return schedDate >= sunday && schedDate <= saturday &&
        (!userId || (typeof s.employee_id === 'object' && s.employee_id !== null ? s.employee_id._id : s.employee_id) === userId);
    });
    // 🧠 Debug log for your user’s weekly schedule
    if (userId) {
      console.log("📆 Weekly Schedules for User:", userId);
      weekSchedules.forEach((s: any) => {
        console.log(
          `➡️ ${s.day_of_week} (${new Date(s.date!).toLocaleDateString("en-CA", { timeZone: timezone })})`,
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
      userId: typeof s.employee_id === 'object' && s.employee_id !== null ? s.employee_id._id : s.employee_id,
      username: typeof s.employee_id === 'object' && s.employee_id !== null ? s.employee_id.username : undefined,
      branchId: typeof s.branch_id === 'object' && s.branch_id !== null ? s.branch_id._id : s.branch_id, // schedule branch ID
      branchName: typeof s.branch_id === 'object' && s.branch_id !== null ? s.branch_id.name : undefined, // schedule branch name
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

export const getMonthlySchedules = async (opts: { userId?: string; timezone?: string } = {}) => {
  const { userId, timezone = "Asia/Colombo" } = opts;
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
  try {
    // ✅ Correct API endpoint for attendance history
    const resp = await axiosInstance.get("/attendance/my-history", { params: { page: 1, limit: 500 } });
    const allSchedules = resp.data?.attendance ?? resp.data?.data ?? [];
    // Filter for this month and optionally by userId
    const monthSchedules = allSchedules.filter((s: any) => {
      if (!s.In) return false;
      const schedDate = new Date(s.In!);
      return schedDate >= firstDay && schedDate <= lastDay &&
        (!userId || s.employeeId === userId); // Fixed: assuming field is employeeId
    });
    console.log("\n🗓️ MONTHLY SCHEDULES ===========================");
    if (monthSchedules.length > 0) {
      monthSchedules.forEach((s: any) => {
        const inTime = s.In?.split(" ")[1] ?? "--:--";
        const outTime = s.Out?.split(" ")[1] ?? "--:--";
        console.log(
          `➡️ (${new Date(s.In!).toLocaleDateString("en-CA", { timeZone: timezone })})`,
          `| Branch: ${s.branch?.name || "Unknown"}`,
          `| ${inTime} - ${outTime}`
        );
      });
    } else {
      console.log("⚠️ No monthly schedules found.");
    }
    return monthSchedules;
  } catch (err: any) {
    console.error("❌ getMonthlySchedules failed:", err.response?.data ?? err.message);
    return [];
  }
};

// Combine weekly and monthly schedules
export const showWeeklyAndMonthlySchedules = async (userId?: string) => {
  console.log("===============================================");
  console.log("🧩 Fetching Weekly and Monthly Schedules...");
  console.log("===============================================");
  const weekly = await getWeeklySchedules({ userId });
  const monthly = await getMonthlySchedules({ userId });
  // Calculate total duration for monthly schedules
  let totalMinutes = 0;
  monthly.forEach((sched: any) => {
    if (sched.In && sched.Out) {
      const { h, m } = calcDuration(sched.In.split(" ")[1], sched.Out.split(" ")[1]);
      totalMinutes += h * 60 + m;
    }
  });
  const totalText = `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}h ${String(
    totalMinutes % 60
  ).padStart(2, "0")}m`;
  console.log("\n✅ Summary:");
  console.log(`Weekly schedules: ${weekly.length}`);
  console.log(`Monthly schedules: ${monthly.length}`);
  console.log(`Total hours this month: ${totalText}`);
  console.log("===============================================");
};

export const getSchedules = async (): Promise<ScheduleItem[]> => {
  try {
    const res = await axiosInstance.get<ScheduleResponse>("/schedule");
    if (res.data?.schedules) {
      return res.data.schedules;
    }
    return [];
  } catch (err: any) {
    console.error("getSchedules error:", err?.response?.data || err);
    throw err?.response?.data || err;
  }
};

export const getSchedulesForDate = async (
  dateYMD: string,
  opts: { userId?: string; branchId?: string; timezone?: string } = {}
): Promise<ScheduleItem[]> => {
  const { userId, branchId, timezone = "Asia/Colombo" } = opts;
  let page = 1;
  const limit = 20;
  let totalPages = 1;
  let allSchedules: ScheduleItem[] = [];
  try {
    while (page <= totalPages) {
      const res = await axiosInstance.get<ScheduleResponse>("/schedule", {
        params: { page, limit },
      });
      const schedules = res.data?.schedules ?? [];
      allSchedules = allSchedules.concat(schedules);
      if (res.data.totalPages) totalPages = res.data.totalPages;
      else if (res.data.total && res.data.limit)
        totalPages = Math.ceil(res.data.total / res.data.limit);
      page++;
      if (page > 50) break; // safety
    }
    // Filter schedules for the selected date
    const filtered = allSchedules.filter((s) => {
      if (!s.date) return false;
      const schedDate = new Date(s.date).toLocaleDateString("en-CA", { timeZone: timezone });
      return (
        schedDate === dateYMD &&
        (!userId || (typeof s.employee_id === 'object' && s.employee_id !== null ? s.employee_id._id : s.employee_id) === userId) &&
        (!branchId || (typeof s.branch_id === 'object' && s.branch_id !== null ? s.branch_id._id : s.branch_id) === branchId)
      );
    });
    console.log(`📅 Found ${filtered.length} schedules for ${dateYMD}`);
    return filtered;
  } catch (err: any) {
    console.error("❌ getSchedulesForDate failed:", err.response?.data || err.message);
    return [];
  }
};

/**
 * Fetch attendance report between startDate and endDate.
 * Optionally pass branchId to limit to a branch.
 */
export const getAttendanceReport = async (
  startDate: string,
  endDate: string,
  branchId: string
): Promise<AttendanceReportItem[]> => {
  try {
    const res = await axiosInstance.get("/admin/attendance/report", {
      params: { startDate, endDate, branchId },
    });
    // 👇 Extract correctly from rows
    const data = Array.isArray(res.data?.rows) ? res.data.rows : [];
    console.log("✅ Parsed attendance array length:", data.length);
    return data;
  } catch (error: any) {
    console.error("❌ Failed to fetch attendance report:", error.response?.data || error.message);
    throw error;
  }
};

export const getMyAttendanceHistory = async (): Promise<AttendanceRecord[]> => {
  try {
    const res = await axiosInstance.get('/attendance/my-history');
    if (!res?.data) {
      console.warn('⚠️ Attendance API returned empty response');
      return [];
    }
    if (res.data.success && Array.isArray(res.data.data)) {
      const allRecords = res.data.data;
      // 🔥 Get local date (correct)
      const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
      console.log("📅 Local Today:", today);
      // 🔥 Filter today's records based on created_at
      const todaysRecords = allRecords.filter((record: any) => {
        const createdDate = record.created_at?.split(" ")[0];
        return createdDate === today;
      });
      // 🔥 Log only today’s attendance
      console.log("📌 Today Attendance Records create_at 123455:", todaysRecords);
      return todaysRecords; // return only today’s records
    }
    console.warn('⚠️ Attendance API returned success=false or invalid data:', res.data);
    return [];
  } catch (err) {
    console.error('❌ Error fetching attendance history:', err);
    return [];
  }
};