// src/api/schedule.ts
import axiosInstance from './axiosInstance';

export interface ScheduleItem {
  _id: string;
  employee_id?: any; // backend sometimes returns object or id - sample has object with role & _id
  branch_id?: any;   // object { _id, name } or id
  date?: string;     // ISO date string
  [k: string]: any;
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
  day_of_week: string;
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
    const requiredFields = ["employee_id", "branch_id", "date", "start_time", "end_time", "day_of_week"];
    for (const field of requiredFields) {
      if (!payload[field]) throw new Error(`Missing required field: ${field}`);
    }
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
