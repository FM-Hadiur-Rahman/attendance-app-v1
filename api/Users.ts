// src/api/Users.ts
import axiosInstance from "./axiosInstance";

export interface Branch {
  _id: string;
  name?: string;
}

export interface ApiUser {
  _id: string;
  username?: string;
  fullname?: string;
  firstname?: string;
  lastname?: string;
  position?: string;
  phone?: string;
  email?: string;
  role?: string;
  branch?: Branch | null;
  [key: string]: any;
}

/**
 * Normalized user type used in the app
 */
export interface User {
  id: string;
  username?: string;
  fullname?: string;
  firstname?: string;
  lastname?: string;
  position?: string;
  phone?: string;
  email?: string;
  role?: string;
  branch?: Branch | null;
  branch_id?: string | null;
  raw?: ApiUser;
}

type FetchUsersParams = {
  page?: number;
  limit?: number;
  // other filters can be added
};

export async function fetchUsers(params: FetchUsersParams = {}): Promise<User[]> {
  const { page = 1, limit = 100 } = params;
  try {
    const res = await axiosInstance.get("/users", { params: { page, limit } });
    const data = res?.data ?? {};
    const apiUsers: ApiUser[] = Array.isArray(data.users) ? data.users : [];

    const users: User[] = apiUsers.map((u) => ({
      id: u._id,
      username: u.username,
      fullname: u.fullname,
      position: u.position,
      phone: u.phone,
      email: u.email,
      role: u.role,
      branch: u.branch ?? null,
      branch_id: u.branch ? u.branch._id : (u as any).branch_id ?? null,
      raw: u,
    }));

    return users;
  } catch (err) {
    console.error("fetchUsers error:", err);
    // return empty array instead of throwing so callers can safely operate
    return [];
  }
}

/**
 * get single user by id (tries API then normalizes)
 */
export async function getUserById(id: string): Promise<User | null> {
  try {
    const res = await axiosInstance.get(`/users/${id}`);
    const u: ApiUser = res.data?.user ?? res.data ?? null;
    if (!u) return null;
    return {
      id: u._id,
      username: u.username,
      fullname: u.fullname,
      firstname: u.firstname,
      lastname: u.lastname,
      position: u.position,
      phone: u.phone,
      email: u.email,
      role: u.role,
      branch: u.branch ?? null,
      branch_id: u.branch ? u.branch._id : (u as any).branch_id ?? null,
      raw: u,
    };
  } catch (err) {
    return null;
  }
}

/**
 * createUser / updateUser helpers if you want to call API
 * NOTE: API endpoints for create/update assumed to be POST /users and PUT /users/:id; adjust if different
 */
export async function createUser(payload: Partial<ApiUser>) {
  return axiosInstance.post("/users", payload);
}
export async function updateUser(id: string, payload: Partial<ApiUser>) {
  return axiosInstance.put(`/users/${id}`, payload);
}
