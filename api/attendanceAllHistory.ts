// src/api/attendanceAllHistory.ts
import axiosInstance from './axiosInstance';

export interface AttendanceHistoryItem {
  id: string;
  _id: string;
  user: {
    id: string;
    _id: string;
    username?: string;
    email?: string;
  };
  In: string; // "YYYY-MM-DD HH:mm:ss"
  Out?: string;
  branch_id?: string;
  branch?: { id?: string; _id?: string; name?: string };
  created_at?: string;
  updated_at?: string;
}

/**
 * GET /admin/attendance/all-history
 * Returns array in res.data.data
 */
export const getAttendanceAllHistory = async (): Promise<AttendanceHistoryItem[]> => {
  try {
    const res = await axiosInstance.get('/admin/attendance/all-history');
    const arr = res?.data?.data ?? res?.data ?? [];
    if (!Array.isArray(arr)) return [];
    return arr as AttendanceHistoryItem[];
  } catch (err: any) {
    console.error('getAttendanceAllHistory error', err?.response?.data ?? err);
    throw err?.response?.data ?? err;
  }
};