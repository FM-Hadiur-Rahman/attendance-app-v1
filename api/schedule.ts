// // src/api/schedule.ts
// import axiosInstance from './axiosInstance';

// export interface ScheduleItem {
//   _id: string;
//   employee_id?: any; // backend shape: object or id
//   branch_id?: any;
//   date?: string; // ISO date string
//   start_time?: string;
//   end_time?: string;
//   [k: string]: any;
// }

// export interface GetSchedulesResponse {
//   success?: boolean;
//   page?: number;
//   limit?: number;
//   total?: number;
//   totalPages?: number;
//   schedules?: ScheduleItem[];
// }

// /**
//  * Fetch schedules. You can pass params like { date: 'YYYY-MM-DD', page, limit, branch }
//  * If backend supports a `date` query param, it will be used. Otherwise the client can filter.
//  */
// export const getSchedules = async (params: Record<string, any> = {}): Promise<GetSchedulesResponse> => {
//   try {
//     const res = await axiosInstance.get('/schedule', { params });
//     const data = res?.data ?? {};
//     // normalize an array under `schedules`
//     const schedules = data.schedules ?? (Array.isArray(data) ? data : []);
//     return {
//       ...data,
//       schedules: Array.isArray(schedules) ? schedules : [],
//     } as GetSchedulesResponse;
//   } catch (err: any) {
//     console.error('getSchedules error', err?.response?.data ?? err);
//     throw err?.response?.data || err;
//   }
// };




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
