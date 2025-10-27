// src/api/Branch.ts
import axiosInstance from './axiosInstance';

export interface BranchCreatePayload {
  name: string;
  latitude?: string;
  longitude?: string;
  phone?: string;
  email?: string;
}

export interface Branch {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  location?: any;
  [k: string]: any;
}

export interface GetBranchesResponse {
  success: boolean;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  branches?: Branch[];
}

/**
 * Fetch branches (paginated). You can pass query params like { page, limit }.
 */
export const getBranches = async (params: Record<string, any> = {}) : Promise<GetBranchesResponse> => {
  try {
    const response = await axiosInstance.get('/branch', { params });
    return response.data as GetBranchesResponse;
  } catch (err: any) {
    console.error('getBranches error', err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};

/**
 * Create a new branch (requires superadmin token).
 * Returns the created branch object (or backend response).
 */
export const createBranch = async (data: BranchCreatePayload) : Promise<Branch> => {
  try {
    const response = await axiosInstance.post('/branch', data);
    // backend may return the created resource directly or wrap it — adjust if necessary
    // Here we assume response.data contains created branch object
    return response.data as Branch;
  } catch (err: any) {
    console.error('createBranch error', err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};
