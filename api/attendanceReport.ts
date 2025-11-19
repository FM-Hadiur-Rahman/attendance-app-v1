// src/api/attendanceReport.ts
import axiosInstance from './axiosInstance';

export interface AttendanceReportRow {
  employeeId: string;
  id?: string;
  _id?: string;
  username?: string;
  fullname?: string;
  date: string; // "YYYY-MM-DD"
  scheduledStart?: string; // "09:00"
  scheduledEnd?: string;
  actualIn?: string; // ISO string or empty
  actualOut?: string; // ISO string or empty
  startStatus?: string;
  endStatus?: string;
  [k: string]: any;
}

export interface AttendanceReportResponse {
  success: boolean;
  startDate?: string;
  endDate?: string;
  totalRows?: number;
  rows?: AttendanceReportRow[];
}

/**
 * GET /admin/attendance/report
 * Accepts: { branchId?, employeeId?, startDate, endDate, ... }
 * Returns rows[] in response.data
 */
export const getAttendanceReport = async (params: {
  branchId?: string;
  employeeId?: string;
  startDate: string;
  endDate: string;
  format?: string;
}): Promise<AttendanceReportRow[]> => {
  try {
    const queryParams: Record<string, any> = {};
    if (params.branchId) queryParams.branchId = params.branchId;
    if (params.employeeId) queryParams.employeeId = params.employeeId;
    if (params.startDate) queryParams.startDate = params.startDate;
    if (params.endDate) queryParams.endDate = params.endDate;
    if (params.format) queryParams.format = params.format;

    const res = await axiosInstance.get('/admin/attendance/report', { params: queryParams });
    const data = res?.data ?? {};
    // backend shape: { success: true, rows: [...] } or res.data.rows
    const rows = data.rows ?? data.data ?? [];
    // Normalize rows so we always expose `fullname` (prefer fullname/full_name/name) and
    // remove `username` to avoid UI falling back to username accidentally.
    const normalized = (Array.isArray(rows) ? rows : []).map((r: AttendanceReportRow) => {
      const fullname = r.fullname || r.full_name || r.name || "";
      const clone: AttendanceReportRow = { ...r, fullname };
      if ('username' in clone) delete (clone as any).username;
      return clone;
    });
    return normalized as AttendanceReportRow[];

  } catch (err: any) {
    console.error('getAttendanceReport error', err?.response?.data ?? err);
    throw err?.response?.data ?? err;
  }
};

/**
 * Lightweight helper to fetch schedules for a date range. This re-uses schedule endpoint.
 * GET /schedule?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=1000
 */
export const getSchedulesForRange = async (startDate: string, endDate: string) => {
  try {
    const res = await axiosInstance.get('/schedule', { params: { startDate, endDate, limit: 1000 } });
    const data = res?.data ?? {};
    // backend may return { schedules: [...] } or array
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.schedules)) return data.schedules;
    return [];
  } catch (err: any) {
    console.error('getSchedulesForRange error', err?.response?.data ?? err);
    return [];
  }
};

/**
 * Helper to fetch users (delegates to /users endpoint with optional branch + role).
 * GET /users?branch=<branchId>&role=user&limit=1000
 */
export const getUsersForBranch = async (branchId?: string) => {
  try {
    const params: any = { limit: 1000 };
    if (branchId) params.branch = branchId;
    params.role = 'user';
    const res = await axiosInstance.get('/users', { params });
    const data = res?.data ?? {};
    if (Array.isArray(data.users)) return data.users;
    if (Array.isArray(data)) return data;
    // sometimes backend returns { data: { users: [...] } }
    if (Array.isArray(data.data?.users)) return data.data.users;
    return [];
  } catch (err: any) {
    console.error('getUsersForBranch error', err?.response?.data ?? err);
    return [];
  }
};


