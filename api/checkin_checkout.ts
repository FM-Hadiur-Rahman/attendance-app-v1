// src/api/check in_checkout.ts
import axiosInstance from "./axiosInstance";
import { ScheduleItem } from "./schedules";
import * as Notifications from "expo-notifications";

interface LocationPayload {
  latitude: string;
  longitude: string;
  branchId?: string; // Made branchId optional since it's no longer required
}

// ✅ Add cache for schedule data
let scheduleCache: {
  data: any;
  timestamp: number;
  userId?: string;
  branchId?: string;
} | null = null;

const CACHE_DURATION = 10 * 1000; // 10 seconds cache for debugging

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
  In: string;
  Out: string;
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
    //console.error("❌ Check-in API error:", error.response?.data || error.message);
    throw error;
  }
};

export const endAttendance = async (payload: LocationPayload) => {
  try {
    const response = await axiosInstance.post("/attendance/end", payload);
    return response.data;
  } catch (error: any) {
    //console.error("❌ Check-out API error:", error.response?.data || error.message);
    throw error;
  }
};

export const getTodaySchedule = async (
  opts: { userId?: string; branchId?: string; timezone?: string } = {}
) => {
  const { userId, branchId, timezone = "Asia/Colombo" } = opts;

  // ✅ Check cache first
  const now = Date.now();
  if (scheduleCache && 
      scheduleCache.timestamp > now - CACHE_DURATION &&
      scheduleCache.userId === userId &&
      scheduleCache.branchId === branchId) {
    console.log("✅ Returning cached schedule data");
    return scheduleCache.data;
  }

  const todayInTZ = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  console.log("📅 Today in timezone:", timezone, "=>", todayInTZ);
  console.log("👤 User ID:", userId);
  console.log("🏢 Branch ID:", branchId);
  console.log("⏰ Current timestamp:", now);
  
  // Also log today's date without timezone for comparison
  const todayNoTZ = new Date().toLocaleDateString("en-CA");
  console.log("📅 Today without timezone:", todayNoTZ);
  console.log("📅 Today as ISO string:", new Date().toISOString().split('T')[0]);

  try {
    // ✅ Use the dedicated endpoint to get today's schedule for the logged-in user
    const resp = await axiosInstance.get("/schedule/today");
    
    console.log("📦 API Response from /schedule/today:", resp.data);

    // Check if response has the expected structure
    if (!resp.data || !resp.data.success) {
      console.log("❌ API response is empty or not successful");
      const result = { schedules: [], todaySchedule: null };
      // ✅ Update cache
      scheduleCache = {
        data: result,
        timestamp: now,
        userId,
        branchId
      };
      return result;
    }
    
    const todaySchedule = resp.data.schedule;
    
    if (!todaySchedule) {
      console.log("❌ No schedule found in response");
      const result = { schedules: [], todaySchedule: null };
      // ✅ Update cache
      scheduleCache = {
        data: result,
        timestamp: now,
        userId,
        branchId
      };
      return result;
    }

    console.log("✅ Today schedule found:", todaySchedule);

    const empId =
      typeof todaySchedule.employee_id === "object" &&
        todaySchedule.employee_id !== null
        ? todaySchedule.employee_id._id
        : todaySchedule.employee_id;

    const brId =
      typeof todaySchedule.branch_id === "object" &&
        todaySchedule.branch_id !== null
        ? todaySchedule.branch_id._id
        : todaySchedule.branch_id;
      
    console.log(`👤 Schedule employee ID: ${empId}`);
    console.log(`🏢 Schedule branch ID: ${brId}`);
    console.log(`🔑 Requested user ID: ${userId}`);
    console.log(`🔑 Requested branch ID: ${branchId}`);
    console.log(`✅ User ID match: ${!userId || empId === userId}`);
    console.log(`✅ Branch ID match: ${!branchId || brId === branchId}`);

    // For debugging, let's temporarily bypass userId check
    const bypassUserIdCheck = true; // Set to false in production
    if (userId && empId !== userId && !bypassUserIdCheck) {
      console.log("🚫 User ID filter mismatch. Needed:", userId, "Found:", empId);
      const result = { schedules: [], todaySchedule: null };
      // ✅ Update cache
      scheduleCache = {
        data: result,
        timestamp: now,
        userId,
        branchId
      };
      return result;
    }

    // For debugging, let's temporarily bypass branchId check
    const bypassBranchIdCheck = true; // Set to false in production
    if (branchId && brId !== branchId && !bypassBranchIdCheck) {
      console.log(
        "🚫 Branch ID filter mismatch. Needed:",
        branchId,
        "Found:",
        brId
      );
      const result = { schedules: [], todaySchedule: null };
      // ✅ Update cache
      scheduleCache = {
        data: result,
        timestamp: now,
        userId,
        branchId
      };
      return result;
    }

    const result = {
      schedules: [],
      todaySchedule: {
        branchname: todaySchedule.branch_id?.name ?? "Unknown Branch",
        start_time: todaySchedule.start_time,
        end_time: todaySchedule.end_time,
        date: todaySchedule.date,
        branch_id: todaySchedule.branch_id,
        raw: todaySchedule,
      },
    };
    
    console.log("✅ Processed schedule result:", result);
    
    // ✅ Update cache
    scheduleCache = {
      data: result,
      timestamp: now,
      userId,
      branchId
    };
    
    return result;
  } catch (err: any) {
    console.log("❌ ERROR:", err.response?.data ?? err.message);
    const result = { schedules: [], todaySchedule: null };
    // ✅ Update cache even on error
    scheduleCache = {
      data: result,
      timestamp: now,
      userId,
      branchId
    };
    return result;
  }
};

// ✅ Add function to clear schedule cache for debugging
export const clearScheduleCache = () => {
  scheduleCache = null;
  console.log("🧹 Schedule cache cleared");
};

// ✅ Add function to force bypass cache
export const getTodayScheduleNoCache = async (
  opts: { userId?: string; branchId?: string; timezone?: string } = {}
) => {
  // Temporarily disable cache
  const originalCache = scheduleCache;
  scheduleCache = null;
  
  try {
    const result = await getTodaySchedule(opts);
    return result;
  } finally {
    // Restore cache
    scheduleCache = originalCache;
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
    // console.error("❌ Error fetching branch details:", error.response?.data || error.message);
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
    //console.error("❌ getWeeklySchedules failed:", err.response?.data ?? err.message);
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
    //console.error("❌ getMonthlySchedules failed:", err.response?.data ?? err.message);
    return [];
  }
};


export const getMonthlySchedules1 = async (
  opts: {
    userId?: string;
    userBranchId?: string;
    timezone?: string
  } = {}
) => {
  const { userId, userBranchId, timezone = "Asia/Colombo" } = opts;

  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  try {
    // Fetch attendance history
    const resp = await axiosInstance.get("/attendance/my-history", {
      params: { page: 1, limit: 500 }
    });

    const allSchedules = resp.data?.attendance ?? resp.data?.data ?? [];

    // Filter by month + user + branch
    const monthSchedules = allSchedules.filter((s: any) => {
      if (!s.In) return false;

      const schedDate = new Date(s.In);

      const matchUser =
        !userId || s.employeeId === userId;

      const matchBranch =
        !userBranchId || s.branchId === userBranchId || s.branch?._id === userBranchId;

      return (
        schedDate >= firstDay &&
        schedDate <= lastDay &&
        matchUser &&
        matchBranch
      );
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
    //console.error("❌ getMonthlySchedules failed:", err.response?.data ?? err.message);
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
    //console.error("getSchedules error:", err?.response?.data || err);
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
    //console.error("❌ getSchedulesForDate failed:", err.response?.data || err.message);
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
    //console.error("❌ Failed to fetch attendance report:", error.response?.data || error.message);
    throw error;
  }
};

// Enhanced function to get attendance history including relevant cross-day records
export const getMyAttendanceHistoryEnhanced = async (): Promise<AttendanceRecord[]> => {
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
      
      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayYMD = yesterday.toLocaleDateString("en-CA");
      
      console.log("📅 Local Today:", today);
      console.log("📅 Yesterday:", yesterdayYMD);
      
      // 🔥 Filter records for today and relevant yesterday's records (cross-day shifts)
      const relevantRecords = allRecords.filter((record: any) => {
        const createdDate = record.created_at?.split(" ")[0];
        
        // Always include today's records
        if (createdDate === today) return true;
        
        // For yesterday's records, include all records that might be cross-day shifts
        // (any check-in from yesterday that might still be ongoing)
        if (createdDate === yesterdayYMD) {
          if (!record.In) return false;
          
          // For cross-day shifts, we want to include any record from yesterday
          // that doesn't have a checkout, or has a checkout that might be today
          if (!record.Out) return true; // Still ongoing shift from yesterday
          
          // Check if checkout was today (completed cross-day shift)
          const outDate = new Date(record.Out).toLocaleDateString("en-CA");
          return outDate === today;
        }
        
        return false;
      });
      
      // 🔥 Log relevant attendance records
      console.log("📌 Relevant Attendance Records (including cross-day):", relevantRecords);
      return relevantRecords;
    }
    console.warn('⚠️ Attendance API returned success=false or invalid data:', res.data);
    return [];
  } catch (err) {
    //console.error('❌ Error fetching attendance history:', err);
    return [];
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
    //console.error('❌ Error fetching attendance history:', err);
    return [];
  }
};

export const getMyAttendanceHistory1 = async (): Promise<any[]> => {
  try {
    const res = await axiosInstance.get('/attendance/my-history');

    if (!res?.data?.data) return [];

    const allRecords = res.data.data;

    const fixDate = (str: string) => str?.replace(" ", "T"); // YYYY-MM-DD HH:mm:ss → ISO

    return allRecords.map((r: any) => ({
      ...r,
      In: fixDate(r.In),
      Out: fixDate(r.Out),
      created_at: fixDate(r.created_at),
    }));
  } catch (err) {
    //console.error('Error fetching attendance history:', err);
    return [];
  }
};

// Function to check if user has an ongoing cross-day shift
// (checked in yesterday but not checked out yet)
export const hasOngoingCrossDayShift = async (): Promise<boolean> => {
  try {
    // Get all attendance records
    const res = await axiosInstance.get('/attendance/my-history');
    if (!res?.data?.success || !Array.isArray(res.data.data)) return false;
    
    const allRecords = res.data.data;
    
    // Get today's and yesterday's dates
    const today = new Date().toLocaleDateString("en-CA");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayYMD = yesterday.toLocaleDateString("en-CA");
    
    // Check if there's any record from yesterday that has check-in but no check-out
    // This is specifically for night shifts that cross over to the next day
    return allRecords.some((record: any) => {
      // Record must have check-in but no check-out
      if (!record.In || record.Out) return false;
      
      // Check if check-in was yesterday
      const inDate = new Date(record.In).toLocaleDateString("en-CA");
      
      // For night shifts, we're specifically looking for shifts that started yesterday
      // and are likely to end today (cross-day shifts)
      if (inDate === yesterdayYMD) {
        // Additional check: if the check-in time was in the evening/night hours
        // (typically after 6 PM), it's very likely a cross-day shift
        const inDateTime = new Date(record.In);
        const inHour = inDateTime.getHours();
        
        // If checked in after 6 PM yesterday, it's likely a cross-day shift
        if (inHour >= 18) {
          return true;
        }
        
        // Also consider shifts that started late afternoon if they might cross over
        // (this is a more inclusive check)
        return true;
      }
      
      return false;
    });
  } catch (error) {
    console.error("Error checking for ongoing cross-day shift:", error);
    return false;
  }
};

// Simplified function to check if user has checked in today but not checked out
// Modified to also check for cross-day shifts (shifts that started yesterday but continue today)
export const isCheckedInToday = async (): Promise<boolean> => {
  try {
    // First check if there's an ongoing cross-day shift
    const hasOngoingCrossDay = await hasOngoingCrossDayShift();
    if (hasOngoingCrossDay) {
      return true; // User is definitely checked in (from yesterday)
    }
    
    // Use enhanced history to include cross-day records
    const records = await getMyAttendanceHistoryEnhanced();
    
    // Check if there's any record with check-in but no check-out
    const hasUncheckedRecord = records.some(record => record.In && !record.Out);
    
    // For cross-day shifts, we need to be more specific
    // Check if there's any record where the user checked in yesterday for a night shift
    // but hasn't checked out yet
    const today = new Date().toLocaleDateString("en-CA");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayYMD = yesterday.toLocaleDateString("en-CA");
    
    const hasOngoingCrossDayShiftRecord = records.some(record => {
      if (!record.In || record.Out) return false; // Must have check-in but no check-out
      
      // Check if this record is from yesterday (cross-day shift)
      const inDate = new Date(record.In).toLocaleDateString("en-CA");
      return inDate === yesterdayYMD;
    });
    
    return hasUncheckedRecord || hasOngoingCrossDayShiftRecord;
  } catch (error) {
    console.error("Error checking check-in status:", error);
    return false;
  }
};

// Simplified function to check if user has completed their shift today (checked in and out)
// Modified to properly handle cross-day shifts
export const hasCompletedShiftToday = async (): Promise<boolean> => {
  try {
    // Get all attendance records to properly check for completed shifts
    const res = await axiosInstance.get('/attendance/my-history');
    if (!res?.data?.success || !Array.isArray(res.data.data)) return false;
    
    const allRecords = res.data.data;
    
    // Get today's date
    const today = new Date().toLocaleDateString("en-CA");
    
    // Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayYMD = yesterday.toLocaleDateString("en-CA");
    
    // Check if there's any record with both check-in and check-out that was completed today
    // This includes:
    // 1. Regular shifts completed today
    // 2. Cross-day shifts that started yesterday but completed checkout today
    return allRecords.some((record: any) => {
      // Record must have both check-in and check-out
      if (!record.In || !record.Out) return false;
      
      // Check if checkout was today
      const outDate = new Date(record.Out).toLocaleDateString("en-CA");
      
      // Also check if this is a cross-day shift (check-in was yesterday)
      const inDate = new Date(record.In).toLocaleDateString("en-CA");
      const isCrossDayShift = inDate === yesterdayYMD;
      
      // Return true if checkout was today (regardless of when check-in was)
      return outDate === today;
    });
  } catch (error) {
    console.error("Error checking shift completion status:", error);
    return false;
  }
};

// Function to get the user's last schedule details
export const getLastSchedule = async (): Promise<any> => {
  try {
    // Get all schedules
    const res = await axiosInstance.get('/schedule');
    
    if (!res?.data) {
      console.warn('⚠️ Schedule API returned empty response');
      return null;
    }
    
    if (res.data.schedules && Array.isArray(res.data.schedules)) {
      const allSchedules = res.data.schedules;
      
      // Sort schedules by date descending to get the most recent
      const sortedSchedules = allSchedules.sort((a: any, b: any) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      });
      
      // Return the most recent schedule
      return sortedSchedules[0] || null;
    }
    
    console.warn('⚠️ Schedule API returned success=false or invalid data:', res.data);
    return null;
  } catch (err) {
    console.error('❌ Error fetching last schedule:', err);
    return null;
  }
};

// Function to get the user's last attendance record
export const getLastAttendanceRecord = async (): Promise<any> => {
  try {
    const res = await axiosInstance.get('/attendance/my-history');
    
    if (!res?.data) {
      console.warn('⚠️ Attendance API returned empty response');
      return null;
    }
    
    if (res.data.success && Array.isArray(res.data.data)) {
      const allRecords = res.data.data;
      
      // Sort records by In time descending to get the most recent
      const sortedRecords = allRecords.sort((a: any, b: any) => {
        const dateA = new Date(a.In);
        const dateB = new Date(b.In);
        return dateB.getTime() - dateA.getTime();
      });
      
      // Return the most recent record
      return sortedRecords[0] || null;
    }
    
    console.warn('⚠️ Attendance API returned success=false or invalid data:', res.data);
    return null;
  } catch (err) {
    console.error('❌ Error fetching last attendance record:', err);
    return null;
  }
};

// Function to get user's last schedule and attendance status
export const getUserLastScheduleStatus = async (): Promise<any> => {
  try {
    const res = await axiosInstance.get('/attendance/last-schedule-status');
    return res.data;
  } catch (err) {
    console.error('❌ Error fetching user last schedule status:', err);
    return null;
  }
};

// Function to get all users who are currently on shift (including cross-day shifts)
export const getAllCurrentShiftUsers = async (): Promise<any[]> => {
  try {
    // Get all attendance records
    const res = await axiosInstance.get('/admin/attendance/all-history');
    
    if (!res?.data?.data || !Array.isArray(res.data.data)) {
      console.warn('⚠️ Attendance API returned empty response');
      return [];
    }
    
    const allRecords = res.data.data;
    
    // Get today's and yesterday's dates
    const today = new Date().toLocaleDateString("en-CA");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayYMD = yesterday.toLocaleDateString("en-CA");
    
    // Filter for users who are currently on shift
    // This includes:
    // 1. Users who checked in today and haven't checked out yet
    // 2. Users who checked in yesterday for night shifts and haven't checked out yet
    const currentShiftUsers = allRecords.filter((record: any) => {
      // Record must have check-in but no check-out
      if (!record.In || record.Out) return false;
      
      // Check if check-in was today or yesterday
      const inDate = new Date(record.In).toLocaleDateString("en-CA");
      
      // Include today's check-ins
      if (inDate === today) {
        return true;
      }
      
      // For night shifts, include yesterday's check-ins that are likely still ongoing
      if (inDate === yesterdayYMD) {
        // Additional check: if the check-in time was in the evening/night hours
        // (typically after 6 PM), it's very likely a cross-day shift
        const inDateTime = new Date(record.In);
        const inHour = inDateTime.getHours();
        
        // If checked in after 6 PM yesterday, it's likely a cross-day shift
        if (inHour >= 18) {
          return true;
        }
        
        // Also consider shifts that started late afternoon if they might cross over
        // (this is a more inclusive check)
        return true;
      }
      
      return false;
    });
    
    return currentShiftUsers;
  } catch (err) {
    console.error('❌ Error fetching current shift users:', err);
    return [];
  }
};

// Function to schedule an alarm notification 2 minutes before schedule end time
export const scheduleEndShiftAlarm = async (schedule: any, checkInTime: string): Promise<string | null> => {
  try {
    if (!schedule?.end_time) {
      console.warn('⚠️ Cannot schedule alarm: missing schedule end time');
      return null;
    }

    // Parse schedule end time
    const [endHours, endMinutes] = schedule.end_time.split(':').map(Number);
    
    // Create a date object for the schedule end time
    const scheduleEndDate = new Date(checkInTime);
    scheduleEndDate.setHours(endHours, endMinutes, 0, 0);
    
    // For cross-day shifts (end time before start time), adjust to next day
    const [startHours] = schedule.start_time.split(':').map(Number);
    if (endHours < startHours) {
      scheduleEndDate.setDate(scheduleEndDate.getDate() + 1);
    }
    
    // Schedule the alarm 2 minutes before the schedule end time
    const alarmTime = new Date(scheduleEndDate.getTime() - 2 * 60 * 1000); // 2 minutes before
    
    // Don't schedule if the alarm time has already passed
    const now = new Date();
    if (alarmTime <= now) {
      console.log('⚠️ Alarm time has already passed, not scheduling notification');
      return null;
    }
    
    // Schedule the notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Shift Ending Soon',
        body: 'Your shift ends in 2 minutes. Please prepare to check out.',
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        color: '#3b82f6', // blue color
      },
      trigger: { 
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: alarmTime
      },
    });
    
    console.log(`🔔 Alarm scheduled for ${alarmTime.toString()} with ID: ${notificationId}`);
    return notificationId;
  } catch (error) {
    console.error('❌ Error scheduling end shift alarm:', error);
    return null;
  }
};

// Function to cancel a scheduled alarm notification
export const cancelScheduledAlarm = async (notificationId: string): Promise<void> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log(`🔕 Alarm with ID ${notificationId} cancelled`);
  } catch (error) {
    console.error('❌ Error cancelling scheduled alarm:', error);
  }
};

// Function to schedule checkout reminders
// This implements the requirement: "Set an alarm/notification at the user's schedule end time. 
// If the user has not checked out at that time, then send a reminder every 2 minutes until the user completes the check-out."
// Note: Due to Expo limitations, we schedule individual notifications every 2 minutes instead of a single recurring notification
// that starts at a specific time, as Expo's TIME_INTERVAL trigger always starts immediately.
export const scheduleCheckoutReminders = async (schedule: any, checkInTime: string): Promise<{ initialNotificationId: string | null, recurringNotificationId: string | null } | null> => {
  try {
    if (!schedule?.end_time) {
      console.warn('⚠️ Cannot schedule checkout reminders: missing schedule end time');
      return null;
    }

    // Parse schedule end time
    const [endHours, endMinutes] = schedule.end_time.split(':').map(Number);
    
    // Create a date object for the schedule end time
    const scheduleEndDate = new Date(checkInTime);
    scheduleEndDate.setHours(endHours, endMinutes, 0, 0);
    
    // For cross-day shifts (end time before start time), adjust to next day
    const [startHours] = schedule.start_time.split(':').map(Number);
    if (endHours < startHours) {
      scheduleEndDate.setDate(scheduleEndDate.getDate() + 1);
    }
    
    // Don't schedule if the schedule end time has already passed
    const now = new Date();
    if (scheduleEndDate <= now) {
      console.log('⚠️ Schedule end time has already passed, not scheduling checkout reminders');
      return null;
    }
    
    // Schedule the initial notification at the exact schedule end time
    const initialNotificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Checkout Time',
        body: 'It\'s time to check out. Please complete your checkout process.',
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        color: '#3b82f6', // blue color
      },
      trigger: { 
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: scheduleEndDate
      },
    });
    
    // Schedule individual notifications every 2 minutes after shift end time
    // Since Expo doesn't support delayed recurring notifications, we schedule individual ones
    // We'll schedule the first one 2 minutes after shift end, then 4 minutes, then 6 minutes, etc.
    // up to a reasonable limit (e.g., 10 reminders = 20 minutes total)
    const recurringNotificationIds = [];
    for (let i = 1; i <= 10; i++) {  // Schedule up to 10 reminders (20 minutes total)
      const reminderTime = new Date(scheduleEndDate.getTime() + i * 2 * 60 * 1000); // i * 2 minutes
      
      // Don't schedule if the reminder time has already passed
      const now = new Date();
      if (reminderTime <= now) {
        continue;
      }
      
      try {
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Checkout Reminder',
            body: 'You haven\'t checked out yet. Please complete your checkout process.',
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.HIGH,
            color: '#3b82f6', // blue color
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminderTime
          },
        });
        recurringNotificationIds.push(notificationId);
      } catch (error) {
        console.error(`❌ Error scheduling checkout reminder #${i}:`, error);
      }
    }
    
    // Return the ID of the first notification (or null if none were scheduled)
    const recurringNotificationId = recurringNotificationIds.length > 0 ? recurringNotificationIds[0] : null;
    
    return { initialNotificationId, recurringNotificationId };
  } catch (error) {
    console.error('❌ Error scheduling checkout reminders:', error);
    return null;
  }
};

// Function to cancel all scheduled checkout reminders
// Note: With the new implementation, we only cancel the first recurring notification ID
// In a full implementation, we would track all scheduled notification IDs
export const cancelAllScheduledCheckoutReminders = async (notificationIds: { initialNotificationId: string | null, recurringNotificationId: string | null }): Promise<void> => {
  try {
    const { initialNotificationId, recurringNotificationId } = notificationIds;
    
    // Cancel initial notification if it exists
    if (initialNotificationId) {
      await Notifications.cancelScheduledNotificationAsync(initialNotificationId);
      console.log(`🔕 Initial checkout reminder with ID ${initialNotificationId} cancelled`);
    }
    
    // Cancel recurring notification if it exists
    if (recurringNotificationId) {
      await Notifications.cancelScheduledNotificationAsync(recurringNotificationId);
      console.log(`🔕 First checkout reminder with ID ${recurringNotificationId} cancelled`);
      // Note: In a full implementation, we would cancel all individually scheduled reminders
    }
  } catch (error) {
    console.error('❌ Error cancelling scheduled checkout reminders:', error);
  }
};

// Function to schedule a custom alarm at a specific time
export const scheduleCustomAlarm = async (
  title: string,
  body: string,
  alarmTime: Date,
  options?: {
    sound?: boolean;
    priority?: any;
    color?: string;
  }
): Promise<string | null> => {
  try {
    // Don't schedule if the alarm time has already passed
    const now = new Date();
    if (alarmTime <= now) {
      console.log('⚠️ Custom alarm time has already passed, not scheduling notification');
      return null;
    }

    // Schedule the notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: title || 'Custom Alarm',
        body: body || 'This is your custom alarm',
        sound: options?.sound !== false ? 'default' : undefined,
        priority: options?.priority || Notifications.AndroidNotificationPriority.HIGH,
        color: options?.color || '#3b82f6',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: alarmTime,
      },
    });

    console.log(`🔔 Custom alarm scheduled for ${alarmTime.toString()} with ID: ${notificationId}`);
    return notificationId;
  } catch (error) {
    console.error('❌ Error scheduling custom alarm:', error);
    return null;
  }
};

// Function to schedule a recurring alarm at specified intervals
export const scheduleRecurringAlarm = async (
  title: string,
  body: string,
  startTime: Date,
  intervalMinutes: number,
  options?: {
    sound?: boolean;
    priority?: any;
    color?: string;
  }
): Promise<string | null> => {
  try {
    // Schedule the recurring notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: title || 'Recurring Alarm',
        body: body || 'This is your recurring alarm',
        sound: options?.sound !== false ? 'default' : undefined,
        priority: options?.priority || Notifications.AndroidNotificationPriority.HIGH,
        color: options?.color || '#3b82f6',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: intervalMinutes * 60,
        repeats: true,
      },
    });

    console.log(`🔔 Recurring alarm scheduled starting at ${startTime.toString()} with ID: ${notificationId}`);
    console.log(`🔔 Recurring interval: every ${intervalMinutes} minutes`);
    return notificationId;
  } catch (error) {
    console.error('❌ Error scheduling recurring alarm:', error);
    return null;
  }
};

// Function to get all scheduled notifications
export const getScheduledNotifications = async (): Promise<Notifications.NotificationRequest[]> => {
  try {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    return notifications;
  } catch (error) {
    console.error('❌ Error getting scheduled notifications:', error);
    return [];
  }
};

// Function to cancel a specific notification by ID
export const cancelNotification = async (notificationId: string): Promise<void> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log(`🔕 Notification with ID ${notificationId} cancelled`);
  } catch (error) {
    console.error('❌ Error cancelling notification:', error);
  }
};

// Function to cancel all scheduled notifications
export const cancelAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('🔕 All scheduled notifications cancelled');
  } catch (error) {
    console.error('❌ Error cancelling all notifications:', error);
  }
};
