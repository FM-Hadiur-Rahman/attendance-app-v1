// src/api/schedule.ts
import axiosInstance from './axiosInstance';

export interface ScheduleItem {
  _id: string;
  id?: string;
  employee_id: string | { _id: string; username: string; role: string; branch: string };
  branch_id: string | { _id: string; name: string };
  date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

/**
 * Fetch schedules (paginated). Accepts optional params (page, limit, etc).
 * Returns the raw response shape (we expect { schedules: ScheduleItem[] } or an array).
 */
export const getSchedules = async (params: Record<string, any> = {}): Promise<ScheduleItem[]> => {
  try {
    const res = await axiosInstance.get('/schedule', { params });
    // backend responds with { schedules: [...] } or sometimes the array directly
    if (res?.data?.schedules && Array.isArray(res.data.schedules)) {
      return res.data.schedules as ScheduleItem[];
    }
    if (Array.isArray(res?.data)) return res.data as ScheduleItem[];
    // fallback: try .schedules or .data
    return (res?.data ?? []) as ScheduleItem[];
  } catch (err: any) {
    console.error('getSchedules error', err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};

/**
 * Convenience: fetch schedules and filter those whose date (local) matches given dateYMD ("YYYY-MM-DD").
 * Uses client-side filter because backend date filtering shape may vary.
 */
export const getSchedulesForDate = async (dateYMD: string): Promise<ScheduleItem[]> => {
  try {
    // try to fetch many entries so we don't miss pages
    const schedules = await getSchedules({ limit: 1000 });
    const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

    return schedules.filter((s) => {
      if (!s?.date) return false;
      const d = new Date(s.date);
      // convert to local YMD to match how we compute today's date in the UI
      const sYMD = toYMD(d);
      return sYMD === dateYMD;
    });
  } catch (err: any) {
    console.error('getSchedulesForDate error', err);
    return [];
  }
};

export interface EmployeeSchedule {
  _id: string;
  employee_id: {
    _id: string;
    username: string;
    role: string;
    branch: string;
  };
  branch_id: { _id: string; name: string };
  date: string;
  start_time: string;
  end_time: string;
  day_of_week: string;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

export const getEmployeeSchedules = async (employee_id: string, startDate: string, endDate: string) => {
  const res = await axiosInstance.get("/schedule/employee", {
    params: { employee_id, startDate, endDate },
  });
  return res.data.schedules as EmployeeSchedule[];
};

// src/api/schedule.ts (append near other exports)
export const postSchedulesBulk = async (
  employee_id: string,
  branch_id: string,
  schedules: Array<{ date: string; day_of_week: string; start_time: string; end_time: string }>
) => {
  try {
    const payload = {
      employee_id: employee_id || "",
      branch_id: branch_id || "",
      schedules,
    };
    const res = await axiosInstance.post("/schedule/bulk", payload);
    return res.data;
  } catch (err: any) {
    console.error("postSchedulesBulk error", err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};

/**
 * ✅ Update a single schedule entry
 */
export const updateSchedule = async (id: string, payload: Partial<ScheduleItem>) => {
  try {
    const res = await axiosInstance.put(`/schedule/${id}`, payload);
    return res.data;
  } catch (err: any) {
    console.error("updateSchedule error", err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};

/**
 * Create a single schedule
 */
export const createSchedule = async (payload: Partial<ScheduleItem>) => {
  try {
    // Check required fields without using string indexing
    if (!payload.employee_id) throw new Error("Missing required field: employee_id");
    if (!payload.branch_id) throw new Error("Missing required field: branch_id");
    if (!payload.date) throw new Error("Missing required field: date");
    if (!payload.start_time) throw new Error("Missing required field: start_time");
    if (!payload.end_time) throw new Error("Missing required field: end_time");
    if (!payload.day_of_week) throw new Error("Missing required field: day_of_week");
    
    const res = await axiosInstance.post("/schedule", payload);
    return res.data;
  } catch (err: any) {
    console.error("createSchedule error", err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};

export const deleteSchedule = async (id: string) => {
  try {
    const res = await axiosInstance.delete(`/schedule/${id}`);
    return res.data;
  } catch (err: any) {
    console.error("deleteSchedule error", err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};

/**
 * Get today's schedule for the logged-in user
 * Uses the dedicated /schedule/today endpoint
 */
export const getTodaySchedule = async (): Promise<ScheduleItem | null> => {
  try {
    const res = await axiosInstance.get('/schedule/today');
    if (res.data?.success && res.data?.schedule) {
      return res.data.schedule as ScheduleItem;
    }
    return null;
  } catch (err: any) {
    console.error('getTodaySchedule error', err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};