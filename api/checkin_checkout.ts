// src/api/check in_checkout.ts
import axiosInstance from "./axiosInstance";
import { ScheduleItem } from "./schedules";

interface LocationPayload {
  latitude: string;
  longitude: string;
  branchId: string;
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
    // ✅ Optimized: Only fetch current page instead of looping through all pages
    const resp = await axiosInstance.get("/schedule/", {
      params: { page: 1, limit: 50 } // Increased limit to get more schedules in one request
    });

    console.log("📦 API Response:", resp.data);
    console.log("📦 API Response structure:", Object.keys(resp.data || {}));

    // Check if response has the expected structure
    if (!resp.data) {
      console.log("❌ API response is empty");
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
    
    // Log the response structure for debugging
    console.log("📦 API Response keys:", Object.keys(resp.data));
    console.log("📦 API Response has schedules:", 'schedules' in resp.data);
    console.log("📦 API Response has data:", 'data' in resp.data);
    
    const schedules: any[] = resp.data?.schedules ?? resp.data?.data ?? [];
    console.log(`📄 Items found:`, schedules.length);
    
    // Additional debugging for response structure
    if (resp.data?.schedules) {
      console.log("📦 Using resp.data.schedules");
    } else if (resp.data?.data) {
      console.log("📦 Using resp.data.data");
    } else {
      console.log("📦 Using empty array as fallback");
    }
    
    // Log the actual data structure for better understanding
    console.log("📦 Response data type:", typeof resp.data);
    if (Array.isArray(resp.data)) {
      console.log("📦 Response data is an array");
    } else if (resp.data && typeof resp.data === 'object') {
      console.log("📦 Response data is an object");
    }
    
    if (schedules.length === 0) {
      console.log("❌ No schedules found in API response");
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
    
    // ✅ Log all schedule dates for debugging
    console.log("📋 All schedule dates:");
    schedules.forEach((s: any, index: number) => {
      console.log(`  ${index + 1}. Date: ${s.date}, Employee: ${s.employee_id}, Branch: ${s.branch_id?.name || s.branch_id}`);
      console.log(`     Full schedule object:`, JSON.stringify(s, null, 2));
    });

    // ✅ Find today's schedule from the current page only
    console.log(`🔍 Searching for today's schedule (${todayInTZ}) among ${schedules.length} schedules`);
    
    // For debugging, let's log the first few schedules in detail
    console.log("📋 First 3 schedules for detailed inspection:");
    schedules.slice(0, 3).forEach((s: any, index: number) => {
      console.log(`  Schedule ${index + 1}:`, {
        date: s.date,
        employee_id: s.employee_id,
        branch_id: s.branch_id,
        start_time: s.start_time,
        end_time: s.end_time
      });
      
      // Check if this schedule has the required fields
      if (!s.date) {
        console.log(`  ❌ Schedule ${index + 1} is missing date field`);
      }
      if (!s.employee_id) {
        console.log(`  ❌ Schedule ${index + 1} is missing employee_id field`);
      }
      if (!s.branch_id && !s.branch) {
        console.log(`  ❌ Schedule ${index + 1} is missing branch information`);
      }
    });
    
    const todaySchedule = schedules.find((s: any) => {
      if (!s?.date) {
        console.log("❌ Skipping schedule with no date");
        return false;
      }

      // ✅ More robust date comparison with multiple format attempts
      console.log(`🔍 Raw schedule date: ${s.date}`);
      
      // Try different date parsing approaches
      let schedDate = "";
      try {
        // Try parsing with different methods
        const dateObj = new Date(s.date);
        if (isNaN(dateObj.getTime())) {
          // If standard parsing fails, try direct string comparison
          console.log("❌ Standard date parsing failed, trying string comparison");
          // Extract date part if it's a datetime string
          const datePart = s.date.split('T')[0];
          schedDate = datePart;
        } else {
          schedDate = dateObj.toLocaleDateString("en-CA", {
            timeZone: timezone,
          });
        }
      } catch (e) {
        console.log("❌ Error parsing date with timezone, trying without timezone");
        try {
          schedDate = new Date(s.date).toLocaleDateString("en-CA");
        } catch (e2) {
          console.log("❌ Error parsing date, using string directly");
          schedDate = s.date.split('T')[0]; // Get date part only
        }
      }
      
      console.log(`🗓 Checking schedule date: ${s.date}`);
      console.log(`📅 Formatted schedule date: ${schedDate}`);
      console.log(`📅 Today date: ${todayInTZ}`);
      
      // ✅ More comprehensive date comparison
      // First, let's try to parse both dates in a more robust way
      const todayDate = new Date();
      let scheduleDate: Date;
      
      try {
        scheduleDate = new Date(s.date);
        console.log(`📅 Parsed schedule date:`, scheduleDate);
        console.log(`📅 Parsed schedule date string:`, scheduleDate.toISOString());
      } catch (parseError) {
        console.log("❌ Error parsing schedule date:", parseError);
        // Try alternative parsing
        try {
          scheduleDate = new Date(s.date.replace(' ', 'T'));
          console.log(`📅 Parsed schedule date (with T):`, scheduleDate);
        } catch (parseError2) {
          console.log("❌ Error parsing schedule date (alternative):", parseError2);
          return false;
        }
      }
      
      // Handle invalid dates
      if (isNaN(scheduleDate.getTime())) {
        console.log("❌ Schedule date is invalid:", s.date);
        return false;
      }
      
      // Compare just the date parts (year, month, day)
      const isSameDate = 
        scheduleDate.getFullYear() === todayDate.getFullYear() &&
        scheduleDate.getMonth() === todayDate.getMonth() &&
        scheduleDate.getDate() === todayDate.getDate();
      
      console.log(`📅 Schedule date object:`, scheduleDate);
      console.log(`📅 Today date object:`, todayDate);
      console.log(`✅ Same date (year/month/day): ${isSameDate}`);
      
      // Also log the individual components for debugging
      console.log(`📅 Schedule components: Year=${scheduleDate.getFullYear()}, Month=${scheduleDate.getMonth()}, Day=${scheduleDate.getDate()}`);
      console.log(`📅 Today components: Year=${todayDate.getFullYear()}, Month=${todayDate.getMonth()}, Day=${todayDate.getDate()}`);
      
      // Additional debugging for date format issues
      console.log(`📅 Schedule date string: ${s.date}`);
      console.log(`📅 Schedule date type: ${typeof s.date}`);
      
      // Try to extract date in different ways
      let extractedDate = "";
      if (typeof s.date === "string") {
        if (s.date.includes('T')) {
          extractedDate = s.date.split('T')[0];
        } else {
          extractedDate = s.date;
        }
      } else {
        extractedDate = scheduleDate.toISOString().split('T')[0];
      }
      
      console.log(`📅 Extracted date: ${extractedDate}`);
      console.log(`📅 Today ISO date: ${todayDate.toISOString().split('T')[0]}`);
      console.log(`✅ Direct string match: ${extractedDate === todayDate.toISOString().split('T')[0]}`);
      
      // Return true if either method matches
      return isSameDate || extractedDate === todayDate.toISOString().split('T')[0];
    });
    
    console.log(`🔍 Search complete. Found today's schedule: ${!!todaySchedule}`);
    if (todaySchedule) {
      console.log(`📋 Today's schedule details:`, todaySchedule);
    }

    if (todaySchedule) {
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
    }

    console.log("❌ No schedule found for today.");
    const result = { schedules: [], todaySchedule: null };
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

// Simplified function to check if user has checked in today but not checked out
export const isCheckedInToday = async (): Promise<boolean> => {
  try {
    const records = await getMyAttendanceHistory();
    // Check if there's any record with check-in but no check-out
    return records.some(record => record.In && !record.Out);
  } catch (error) {
    console.error("Error checking check-in status:", error);
    return false;
  }
};

// Simplified function to check if user has completed their shift today (checked in and out)
export const hasCompletedShiftToday = async (): Promise<boolean> => {
  try {
    const records = await getMyAttendanceHistory();
    // Check if there's any record with both check-in and check-out
    return records.some(record => record.In && record.Out);
  } catch (error) {
    console.error("Error checking shift completion status:", error);
    return false;
  }
};
