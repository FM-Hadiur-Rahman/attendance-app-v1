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

export interface PendingCheckoutUser {
  user: {
    id: string;
    username: string;
    email?: string;
    fullname?: string;
  };
  schedule: {
    id: string;
    start_time: string;
    end_time: string;
    date: string;
  } | null;
  attendance: {
    id: string;
    checkInTime: string;
    branch: {
      id?: string;
      _id?: string;
      name?: string;
    };
  };
  branch: {
    _id?: string;
    name?: string;
  };
  isCrossDayShift?: boolean;
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
 * Fetch schedules for a given employee within a date range
 * Query params: employee_id, startDate, endDate
 */
export const getSchedulesByEmployee = async (
  employee_id: string,
  startDate: string,
  endDate: string
): Promise<ScheduleItem[]> => {
  try {
    const res = await axiosInstance.get('/schedule/employee', {
      params: { employee_id, startDate, endDate }
    });
    
    if (res?.data?.success && Array.isArray(res.data.schedules)) {
      return res.data.schedules as ScheduleItem[];
    }
    
    return [];
  } catch (err: any) {
    console.error('getSchedulesByEmployee error', err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};

/**
 * Convenience: fetch schedules and filter those whose date (local) matches given dateYMD ("YYYY-MM-DD").
 * Uses pagination internally to collect all matching schedules.
 * Returns array of ScheduleItem.
 */
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
      const res = await axiosInstance.get<{ 
        schedules?: ScheduleItem[]; 
        data?: ScheduleItem[]; 
        total?: number; 
        totalPages?: number;
        page?: number;
      }>("/schedule", {
        params: { page, limit },
      });

      // Handle different response formats
      const data = res.data;
      const schedules = Array.isArray(data) 
        ? data 
        : (data?.schedules || data?.data || []);
        
      const total = typeof data === 'object' && data !== null 
        ? ('total' in data ? data.total : ('totalPages' in data ? data.totalPages : undefined))
        : undefined;
      
      totalPages = typeof data === 'object' && data !== null && 'totalPages' in data 
        ? data.totalPages || 1 
        : Math.ceil((total || schedules.length) / limit);

      // Filter schedules for the specific date and optional filters
      const filtered = schedules.filter((s) => {
        if (!s?.date) return false;
        
        // Convert schedule date to local date string for comparison
        const schedDate = new Date(s.date);
        const schedYMD = schedDate.toLocaleDateString("en-CA", { timeZone: timezone });
        
        if (schedYMD !== dateYMD) return false;
        if (userId) {
          const empId = typeof s.employee_id === 'object' && s.employee_id !== null 
            ? s.employee_id._id 
            : s.employee_id;
          if (empId !== userId) return false;
        }
        if (branchId) {
          const brId = typeof s.branch_id === 'object' && s.branch_id !== null 
            ? s.branch_id._id 
            : s.branch_id;
          if (brId !== branchId) return false;
        }
        return true;
      });

      allSchedules = [...allSchedules, ...filtered];
      page++;
    }

    return allSchedules;
  } catch (err: any) {
    console.error("getSchedulesForDate error", err?.response?.data ?? err);
    return [];
  }
};

/**
 * Get users with pending checkouts for a branch
 * Returns users who have a schedule that has ended but haven't checked out yet
 */
export const getPendingCheckoutUsers = async (branchId: string): Promise<PendingCheckoutUser[]> => {
  try {
    const res = await axiosInstance.get('/schedule/pending-checkout', {
      params: { branchId }
    });
    
    if (res?.data?.success && Array.isArray(res.data.data)) {
      return res.data.data as PendingCheckoutUser[];
    }
    
    return [];
  } catch (err: any) {
    console.error('getPendingCheckoutUsers error', err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};

/**
 * Create a new schedule
 * POST /schedule
 */
export const createSchedule = async (scheduleData: Omit<ScheduleItem, '_id' | 'id' | 'createdAt' | 'updatedAt' | '__v'>): Promise<ScheduleItem> => {
  try {
    const res = await axiosInstance.post('/schedule', scheduleData);
    return res.data.data as ScheduleItem;
  } catch (err: any) {
    console.error('createSchedule error', err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};

/**
 * Update an existing schedule
 * PUT /schedule/:id
 */
export const updateSchedule = async (id: string, scheduleData: Partial<ScheduleItem>): Promise<ScheduleItem> => {
  try {
    const res = await axiosInstance.put(`/schedule/${id}`, scheduleData);
    return res.data.data as ScheduleItem;
  } catch (err: any) {
    console.error('updateSchedule error', err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};

/**
 * Delete a schedule
 * DELETE /schedule/:id
 */
export const deleteSchedule = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(`/schedule/${id}`);
  } catch (err: any) {
    console.error('deleteSchedule error', err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};