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
  id?: string;
  name: string;
  phone: string;
  email: string;
  location?: {
    type: 'Point';
    coordinates: [number, number];
  };
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
 * Create a new branch (requires super admin token).
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


export const getBranchById = async (id: string): Promise<Branch> => {
  try {
    const response = await axiosInstance.get(`/branch/${id}`);
    // backend sometimes wraps: adjust to what your backend returns
    const b = response.data?.branch ?? response.data ?? response;
    return b as Branch;
  } catch (err: any) {
    console.error('getBranchById error', err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};

/**
 * Return an array of branch names (simple helper)
 */
export const listBranchNames = async (): Promise<string[]> => {
  try {
    const res = await getBranches({}); // reuse existing function
    // getBranches returns the shape GetBranchesResponse with branches[]
    const branches = res.branches ?? [];
    return branches.map((b) => b.name ?? '').filter(Boolean);
  } catch (err: any) {
    console.error('listBranchNames error', err?.response?.data ?? err);
    // return empty array on failure so calling code can continue gracefully
    return [];
  }
};

/**
 * Update branch by id
 * payload can be { name, phone, latitude, longitude, email, ... }
 */
export const updateBranch = async (id: string, payload: Partial<BranchCreatePayload & Record<string, any>>): Promise<Branch> => {
  try {
    if (!id) throw new Error('updateBranch: missing id');
    const res = await axiosInstance.put(`/branch/${id}`, payload);
    // backend may wrap the branch object under `branch` or return directly
    const b = res?.data?.branch ?? res?.data ?? res;
    return b as Branch;
  } catch (err: any) {
    console.error('updateBranch error', err?.response?.data ?? err);
    throw err?.response?.data || err;
  }
};


/**
 * Return all branches (non-paginated convenience helper).
 * Uses getBranches() under the hood with a large limit.
 */
export const getAllBranches = async (): Promise<Branch[]> => {
  try {
    const res = await getBranches({ limit: 1000 });
    // `getBranches` returns { branches: Branch[] } shape per your file above
    return res.branches ?? [];
  } catch (err: any) {
    console.error('getAllBranches error', err?.response?.data ?? err);
    return [];
  }
};

