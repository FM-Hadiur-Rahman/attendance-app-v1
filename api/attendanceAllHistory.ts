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
    fullname?: string;
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

/**
 * Get all users who are currently on shift (including cross-day shifts from yesterday)
 * Returns users who have checked in but not checked out yet
 */
export const getCurrentShiftUsers = async (): Promise<AttendanceHistoryItem[]> => {
  try {
    const allAttendance = await getAttendanceAllHistory();
    
    // Get today's and yesterday's dates
    const today = new Date().toLocaleDateString("en-CA");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayYMD = yesterday.toLocaleDateString("en-CA");
    
    // Filter for users who are currently on shift
    // This includes:
    // 1. Users who checked in today and haven't checked out yet
    // 2. Users who checked in yesterday for night shifts and haven't checked out yet
    const currentShiftUsers = allAttendance.filter((record: AttendanceHistoryItem) => {
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
  } catch (err: any) {
    console.error('getCurrentShiftUsers error', err?.response?.data ?? err);
    throw err?.response?.data ?? err;
  }
};