// screens/admin/main/more/AddScheduleScreen.tsx

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  Image,
  TouchableOpacity,
  findNodeHandle,
  UIManager,
  Dimensions,
  LayoutChangeEvent,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { RefreshControl } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
// API imports (real data)
import { fetchUsers, ProfileUser, getProfile } from "../../../../api/profile"; // fetchUsers returns { users, page, ... }
import { getAllBranches, Branch as ApiBranch } from "../../../../api/Branchs";
import { getEmployeeSchedules, getSchedules, getSchedulesForDate, ScheduleItem } from "../../../../api/schedules";
import Header from "../../../../components/Header";
import colors from "../../../../styles/Colors";
import CartBox from "../../../../components/CartBox";
import { Button1 } from "../../../../components/Button";
import fonts from "../../../../styles/Fonts";
import InputBox from "../../../../components/InputBox";
import translations from "../../../../assets/translations.json";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../../components/Toast";
import Popup from "../../../../components/Popup";

// --- Local "normalized" types used by this screen ---
type LocalUser = {
  id: string;
  fullname: string;
  branch_id?: string;
  role?: string;
  raw?: ProfileUser;
};

type LocalBranch = {
  id: string;
  name: string;
  raw?: ApiBranch;
};

export default function AddScheduleScreen(props: any) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;
  const userId = propUserId || routeUserId || null;
  const langId = propLangId || routeLangId || "en";
  const lang = (translations as any)[langId] || (translations as any)["en"];
  const [saveConfirmVisible, setSaveConfirmVisible] = useState<boolean>(false);

  // NOTE: screenBranchId is taken from navigation params (the previous screen passes branchId)
  const screenBranchId: string = (route.params?.branch_id as string) ?? (route.params?.branchId as string) ?? "";

  // loading states
  const [loading, setLoading] = useState(false);
  const [effectiveBranchId, setEffectiveBranchId] = useState<string>(""); // <- NEW

  // Local data arrays (start empty, will be populated from API)
  const [localUsers, setLocalUsers] = useState<LocalUser[]>([]);
  const [localBranches, setLocalBranches] = useState<LocalBranch[]>([]);
  // schedules will be fetched from api/schedules.ts
  const [localSchedules, setLocalSchedules] = useState<Array<any>>([]);

  // derived schedules map
  const [localSchedulesByDate, setLocalSchedulesByDate] = useState<Record<string, any[]>>({});
  // UI state
  const [modalEditingId, setModalEditingId] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffError, setStaffError] = useState<string>("");
  const [staffFilterOpen, setStaffFilterOpen] = useState<boolean>(false);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [branchFilterOpen, setBranchFilterOpen] = useState(false);
  const staffInputWrapperRef = useRef<View | null>(null);
  const [staffInputLayout, setStaffInputLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const branchInputWrapperRef = useRef<View | null>(null);
  const [branchInputLayout, setBranchInputLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectedDayYmd, setSelectedDayYmd] = useState<string | null>(null);
  const [timeFrom, setTimeFrom] = useState<string>("");
  const [timeFromError, setTimeFromError] = useState<string>("");
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [durationHours, setDurationHours] = useState<string>("");
  const [durationError, setDurationError] = useState<string>("");
  const [addScheduleModalVisible, setAddScheduleModalVisible] = useState(false);


  const [changeLog, setChangeLog] = useState<Array<{ type: "add" | "update"; schedule: any }>>([]);

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
 const [weekOffset, setWeekOffset] = useState<number>(0); 

  // ------------------------
  // Utility: normalize API shapes to the local shape this screen expects
  // ------------------------
  const normalizeUsers = (users: ProfileUser[] = []): LocalUser[] => {
    return users.map((u) => {
      const id = (u as any)._id ?? (u as any).id ?? "";
      const fullname = (u as any).fullname ?? (u as any).fullName ?? (u as any).name ?? (u as any).username ?? id;
      const branch_id = typeof u.branch === 'string' ? u.branch : (u.branch && (u.branch._id ?? u.branch.id)) ?? (u as any).branch_id ?? "";
      return { id: String(id), fullname: String(fullname), branch_id: String(branch_id || ""), role: u.role, raw: u };
    });
  };

  const normalizeBranches = (branches: ApiBranch[] = []): LocalBranch[] => {
    return branches.map((b) => ({ id: (b as any)._id ?? (b as any).id ?? "", name: (b as any).name ?? (b as any).branch_name ?? "", raw: b }));
  };

  const normalizeSchedules = (schedules: ScheduleItem[] = []): any[] => {
    const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const computeFromStartAndDuration = (start: string, dur: number) => {
      if (!start) return "";
      const parts = start.split(":").map((p) => parseInt(p, 10) || 0);
      const hh = parts[0] || 0;
      const mm = parts[1] || 0;
      const ss = parts[2] || 0;
      const dt = new Date();
      dt.setHours(hh, mm, ss, 0);
      dt.setTime(dt.getTime() + Math.round((dur || 0) * 3600 * 1000));
      return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
    };

    const toLocalYmd = (iso?: string) => {
      if (!iso) return "";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; // local Y-M-D
    };

    return schedules.map((s) => {
      const id = (s as any)._id ?? (s as any).id ?? (s as any).schedule_id ?? '';
      const rawEmployee = (s as any).employee_id ?? (s as any).user_id ?? (s as any).employee ?? null;
      const user_id = typeof rawEmployee === 'string' ? rawEmployee : (rawEmployee && (rawEmployee._id ?? rawEmployee.id)) ?? (s as any).user_id ?? (s as any).employee_id ?? '';
      const branch_raw = (s as any).branch_id ?? (s as any).branch ?? null;
      const branch_id = typeof branch_raw === 'string' ? branch_raw : (branch_raw && (branch_raw._id ?? branch_raw.id)) ?? '';
      const start_time = (s as any).start_time ?? (s as any).start ?? (s as any).from_time ?? '';
      const duration = (s as any).duration ?? (s as any).hours ?? (s as any).dur ?? 0;

      const apiEnd = (s as any).end_time ?? (s as any).end ?? '';
      const end_time = apiEnd && String(apiEnd).trim() !== '' ? String(apiEnd) : computeFromStartAndDuration(String(start_time || ''), Number(duration || 0));

      // Convert API date (ISO) to local Y-M-D so it matches weekDates derived from local timezone
      const dateYmd = toLocalYmd((s as any).date ?? (s as any).day ?? '');

      return {
        id: String(id),
        user_id: String(user_id || ''),
        branch_id: String(branch_id || ''),
        start_time: String(start_time || ''),
        duration: Number(duration || 0),
        end_time: String(end_time || ''),
        date: dateYmd,
        raw: s,
      } as any;
    });
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // Determine branch: prefer route param (screenBranchId), otherwise use logged-in user's profile branch
      let branchToUse: string | undefined = screenBranchId || undefined;

      try {
        const profile = await getProfile();
        const profBranch = typeof profile.branch === 'string' ? profile.branch : profile.branch?._id ?? undefined;
        if (!branchToUse && profBranch) branchToUse = profBranch;
        console.log("getProfile() returned branch:", profBranch);
      } catch (err) {
        // If fetching profile fails, we'll still continue using screenBranchId (if any)
        console.warn('getProfile() failed, falling back to screenBranchId if provided', err);
      }

      // store effective branch id for UI filtering later
      setEffectiveBranchId(branchToUse ?? "");
      console.log("loadInitialData -> branchToUse:", branchToUse);

      // Branches
      const branches = await getAllBranches();
      console.log("getAllBranches raw:", branches);
      const normalizedBranches = normalizeBranches(branches || []);
      setLocalBranches(normalizedBranches);
      const usersResp = await fetchUsers({ branchId: branchToUse || undefined, limit: 1000 });
      console.log("fetchUsers raw:", usersResp);
      const fetchedUsers = usersResp?.users ?? [];
      const normalizedUsers = normalizeUsers(fetchedUsers);
      setLocalUsers(normalizedUsers);

      // Schedules - use new helper from api/schedules.ts
      try {
        const fetchedSchedules = await getSchedules({ limit: 1000 });
        console.log('getSchedules raw count:', Array.isArray(fetchedSchedules) ? fetchedSchedules.length : 0);
        const normalizedSchedules = normalizeSchedules(fetchedSchedules || []);
        setLocalSchedules(normalizedSchedules);
      } catch (err) {
        console.warn('Failed to load schedules from API helper, continuing with empty schedules', err);
        setLocalSchedules([]);
      }

    } catch (err: any) {
      console.warn('loadInitialData failed', err);
      showErrorToast('Failed to load staff or branch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenBranchId]);

  // keep schedules-by-date map up to date when schedules change
  useEffect(() => {
    if (!localSchedules?.length) {
      setLocalSchedulesByDate({});
      return;
    }
    const map: Record<string, any[]> = {};
    localSchedules.forEach((s) => {
      if (!s?.date) return;
      const dateKey = s.date.split("T")[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(s);
    });
    setLocalSchedulesByDate(map);
  }, [localSchedules]);


  const onRefresh = async () => {
    setLoading(true);
    try {
      await loadInitialData();
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.warn('refresh failed', e);
      showErrorToast('Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  // --- helpers (time formatting, pickers, validators) ---
  const formatTime12 = (hhmmss: string) => {
    if (!hhmmss) return "";
    const parts = hhmmss.split(":");
    if (parts.length < 2) return hhmmss;
    let hh = parseInt(parts[0], 10);
    const mm = parts[1];
    const ampm = hh >= 12 ? "PM" : "AM";
    hh = hh % 12;
    if (hh === 0) hh = 12;
    return `${hh}:${mm} ${ampm}`;
  };

  const timeStringToDate = (timeStr: string) => {
    const now = new Date();
    now.setSeconds(0, 0);
    if (!timeStr) return now;
    const parts = timeStr.split(":").map((p) => parseInt(p, 10) || 0);
    now.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
    return now;
  };

  const dateToYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  // WEEK helper

const getWeekDates = (offsetWeeks = 0) => {
    const base = new Date();
    if (offsetWeeks && Number.isFinite(offsetWeeks)) {
      base.setDate(base.getDate() + offsetWeeks * 7);
    }
    const dayIdx = base.getDay();
    const sunday = new Date(base);
    sunday.setDate(base.getDate() - dayIdx);
    sunday.setHours(0, 0, 0, 0);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }
    return days;
  };

  // derive weekDates from current offset
  const weekDates = getWeekDates(weekOffset);

  // computeEndTime, isBeforeToday, onAddSchedule, openAddModalForDate, etc. — keep unchanged logic but adapted to normalized fields
  const computeEndTime = (startHHMMSS: string, durationHrs: number) => {
    if (!startHHMMSS) return "";
    // Accept formats like "HH:MM", "HH:MM:SS", "HH:MM:SS.sss"
    const parts = startHHMMSS.split(":").map((p) => parseInt(p, 10) || 0);
    const hh = parts[0] || 0;
    const mm = parts[1] || 0;
    const ss = parts[2] || 0;
    const dt = new Date();
    dt.setHours(hh, mm, ss, 0);
    dt.setTime(dt.getTime() + Math.round((durationHrs || 0) * 3600 * 1000));
    const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
  };


  const isBeforeToday = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dt.getTime() < today.getTime();
  };

  const onAddSchedule = () => {
    let hasError = false;
    if (!selectedStaffId) {
      setStaffError(lang.Select_staff || "Please select staff");
      showErrorToast(lang.Please_select_staff || "Select staff");
      hasError = true;
    }
    if (!selectedDayYmd) {
      showErrorToast("No date selected");
      hasError = true;
    }
    if (!selectedBranchId) {
      showErrorToast("Please select branch");
      hasError = true;
      setBranchFilterOpen(true);
    }
    if (!timeFrom || timeFrom.trim() === "") {
      setTimeFromError(lang.Required || "Required");
      showErrorToast(lang.Please_enter_start_time || "Enter start time");
      hasError = true;
    }
    const dur = parseFloat(durationHours || "0");
    if (isNaN(dur) || dur <= 0) {
      setDurationError("Invalid duration");
      showErrorToast("Invalid duration");
      hasError = true;
    }
    if (hasError) return;
    const payload: any = {
      user_id: selectedStaffId,
      start_time: timeFrom,
      duration: dur,
      date: selectedDayYmd,
      branch_id: selectedBranchId,
    };
    if (modalEditingId) payload.id = modalEditingId;

    if (typeof route.params?.onSave === "function") {
      try {
        route.params.onSave(payload);
        showSuccessToast(modalEditingId ? lang.schedule_updated || "Schedule updated" : lang.schedule_added || "Schedule added");
      } catch (e) {
        console.warn("onSave callback threw:", e);
      }
      // update localSchedules for UI immediately
      setLocalSchedules((prev) => {
        const copy = prev.map((p) => ({ ...p }));
        if (payload.id) {
          const idx = copy.findIndex((s) => s.id === payload.id);
          if (idx !== -1) {
            copy[idx] = { ...copy[idx], ...payload, updateDate: new Date().toISOString() };
            setChangeLog((c) => [...c, { type: "update", schedule: copy[idx] }]);
          } else {
            const newSch = { id: `S${(copy.length + 1).toString().padStart(3, "0")}`, ...payload, createDate: new Date().toISOString(), updateDate: new Date().toISOString() } as any;
            copy.push(newSch);
            setChangeLog((c) => [...c, { type: "add", schedule: newSch }]);
          }
        } else {
          const newSch = { id: `S${(copy.length + 1).toString().padStart(3, "0")}`, ...payload, createDate: new Date().toISOString(), updateDate: new Date().toISOString() } as any;
          copy.push(newSch);
          setChangeLog((c) => [...c, { type: "add", schedule: newSch }]);
        }
        return copy;
      });
      setAddScheduleModalVisible(false);
      setModalEditingId(null);
      return;
    }
    if (!modalEditingId) {
      const id = `S${(localSchedules.length + 1).toString().padStart(3, "0")}`;
      const newSch = {
        id,
        user_id: payload.user_id,
        start_time: payload.start_time,
        duration: payload.duration,
        date: payload.date,
        branch_id: payload.branch_id,
        createDate: new Date().toISOString(),
        updateDate: new Date().toISOString(),
      } as any;
      setLocalSchedules((prev) => [...prev, newSch]);
      setChangeLog((c) => [...c, { type: "add", schedule: newSch }]);
      showSuccessToast("Schedule added");
    } else {
      setLocalSchedules((prev) => {
        const copy = prev.map((s) => ({ ...s }));
        const idx = copy.findIndex((sch) => sch.id === modalEditingId);
        if (idx !== -1) {
          copy[idx] = {
            ...copy[idx],
            user_id: payload.user_id,
            start_time: payload.start_time,
            duration: payload.duration,
            date: payload.date,
            branch_id: payload.branch_id,
            updateDate: new Date().toISOString(),
          };
          setChangeLog((c) => [...c, { type: "update", schedule: copy[idx] }]);
        }
        return copy;
      });
      showSuccessToast("Schedule updated");
    }
    setAddScheduleModalVisible(false);
    setModalEditingId(null);
  };

  const measureStaffInput = () => {
    const handle = findNodeHandle(staffInputWrapperRef.current);
    if (!handle) return;
    UIManager.measure(handle, (x, y, width, height, pageX, pageY) => {
      setStaffInputLayout({ x: pageX, y: pageY, width, height });
    });
  };

  const onBranchLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    setBranchInputLayout({ x, y, width, height });
  };

  useEffect(() => {
    if (staffFilterOpen) {
      setTimeout(measureStaffInput, 40);
    }
  }, [staffFilterOpen, selectedStaff]);

  useEffect(() => {
    if (branchFilterOpen) {
      setTimeout(() => {
        if (!branchInputLayout) {
          const handle = findNodeHandle(branchInputWrapperRef.current);
          if (handle) {
            UIManager.measure(handle, (x, y, width, height, pageX, pageY) => {
              setBranchInputLayout({ x: pageX, y: pageY, width, height });
            });
          }
        }
      }, 40);
    }
  }, [branchFilterOpen, selectedBranch, addScheduleModalVisible]);

  const openAddModalForDate = (ymd: string) => {
    if (isBeforeToday(ymd)) return;
    if (!selectedStaffId) {
      setStaffError(lang.Select_staff || "Please select staff first");
      showErrorToast(lang.Please_select_staff || "Select staff first");
      setStaffFilterOpen(true);
      setTimeout(measureStaffInput, 40);
      return;
    }
    const daySchedules = localSchedulesByDate[ymd] || [];
    const staffSchedule = daySchedules.find((s) => s.user_id === selectedStaffId) || null;

    setSelectedDayYmd(ymd);
    setDurationError("");
    setTimeFromError("");

    if (staffSchedule) {
      setTimeFrom(staffSchedule.start_time || "");
      setDurationHours(String(staffSchedule.duration ?? ""));
      const br = localBranches.find((b) => b.id === staffSchedule.branch_id);
      if (br) {
        setSelectedBranch(br.name);
        setSelectedBranchId(br.id);
      } else {
        setSelectedBranch("");
        setSelectedBranchId(null);
      }
      setModalEditingId(staffSchedule.id || null);
    } else {
      setTimeFrom("");
      setDurationHours("");
      setModalEditingId(null);
      const staffObj = localUsers.find((u) => u.id === selectedStaffId) || null;
      if (staffObj) {
        const defaultBr = localBranches.find((b) => b.id === staffObj.branch_id);
        if (defaultBr) {
          setSelectedBranch(defaultBr.name);
          setSelectedBranchId(defaultBr.id);
        }
      }
    }

    setAddScheduleModalVisible(true);
  };

  useEffect(() => {
    if (!route.params?.id) return;
    const editingId: string | undefined = route.params?.id;
    if (!editingId) return;
    const s = localSchedules.find((sch) => sch.id === editingId);
    if (!s) return;
    const u = localUsers.find((usr) => usr.id === s.user_id) || null;
    if (u) {
      setSelectedStaff(`${u.fullname}`);
      setSelectedStaffId(u.id);
      const brForUser = localBranches.find((b) => b.id === u.branch_id);
      if (brForUser) {
        setSelectedBranch(brForUser.name);
        setSelectedBranchId(brForUser.id);
      }
    }
    setSelectedDayYmd(s.date);
    setTimeFrom(s.start_time);
    setDurationHours(String(s.duration ?? 8));
    const br = localBranches.find((b) => b.id === s.branch_id);
    if (br) {
      setSelectedBranch(br.name);
      setSelectedBranchId(br.id);
    }
    setModalEditingId(editingId || null);
  }, [route.params?.id, localSchedules, localUsers, localBranches]);

const handleStaffPick = async (u: LocalUser) => {
  try {
    setSelectedStaff(u.fullname);
    setSelectedStaffId(u.id);
    setStaffError("");
    setStaffFilterOpen(false);
    setStaffInputLayout(null);

    // set default branch
    const br = localBranches.find((b) => b.id === u.branch_id);
    if (br) {
      setSelectedBranch(br.name);
      setSelectedBranchId(br.id);
    } else {
      setSelectedBranch("");
      setSelectedBranchId(null);
    }

    if (!u.id) return;

    // compute current-week YMD set (based on current weekOffset)
    const currentWeekDates = weekDates.map((d) => dateToYMD(d));
    const currentWeekSet = new Set(currentWeekDates);

    const currentStart = currentWeekDates[0];
    const currentEnd = currentWeekDates[currentWeekDates.length - 1];

    // 1) fetch schedules (API may return wide range)
    const schedules = await getEmployeeSchedules(u.id, currentStart, currentEnd);
    let fetchedNormalized = normalizeSchedules(Array.isArray(schedules) ? schedules : []);

    console.log('[DEBUG] handleStaffPick: raw fetchedNormalized length=', fetchedNormalized.length);

    // 2) filter to only items that fall inside the CURRENT week (local YMD)
    const currentWeekItems = (fetchedNormalized || []).filter((s) => s && s.date && currentWeekSet.has(s.date));
    console.log('[DEBUG] handleStaffPick: currentWeekItems.length=', currentWeekItems.length, 'currentWeekDates=', currentWeekDates);

    // 3) if none in current week, try previous week (and if found, switch weekOffset)
    if (!currentWeekItems || currentWeekItems.length === 0) {
      const prevWeekDates = getWeekDates(weekOffset - 1).map((d) => dateToYMD(d));
      const prevStart = prevWeekDates[0];
      const prevEnd = prevWeekDates[prevWeekDates.length - 1];

      try {
        const prevSchedules = await getEmployeeSchedules(u.id, prevStart, prevEnd);
        const prevNormalized = normalizeSchedules(Array.isArray(prevSchedules) ? prevSchedules : []);
        const prevWeekItems = (prevNormalized || []).filter((s) => s && s.date && prevWeekDates.includes(s.date));

        console.log('[DEBUG] handleStaffPick: prevWeekItems.length=', prevWeekItems.length, 'prevWeekDates=', prevWeekDates);

        if (prevWeekItems && prevWeekItems.length > 0) {
          // switch UI to previous week so tiles show those dates
          setWeekOffset((o) => o - 1);
          // use prevNormalized as the fetchedNormalized for merging (or keep both)
          fetchedNormalized = prevNormalized;
        } else {
          // no prev-week items either -> keep weekOffset as-is (show current week with no schedules)
          console.log('[DEBUG] handleStaffPick: no schedules in current or previous week');
        }
      } catch (prevErr) {
        console.warn('[WARN] handleStaffPick: failed prev week fetch', prevErr);
      }
    } else {
      // current week had items — ensure UI shows current week
      if (weekOffset !== 0) setWeekOffset(0);
    }

    // 4) merge fetchedNormalized into localSchedules and rebuild date map
    setLocalSchedules((existing) => {
      const byId: Record<string, any> = {};
      (existing || []).forEach((s) => {
        if (s && s.id) byId[String(s.id)] = s;
      });
      (fetchedNormalized || []).forEach((s) => {
        if (s && s.id) byId[String(s.id)] = s;
      });
      const merged = Object.values(byId);

      const map: Record<string, any[]> = {};
      merged.forEach((s) => {
        if (!s?.date) return;
        const dateKey = s.date; // normalizeSchedules sets YYYY-MM-DD (local)
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(s);
      });

      setLocalSchedulesByDate(map);
      console.log('[DEBUG] handleStaffPick: merged total=', merged.length, 'dateKeys=', Object.keys(map).slice(0, 30));
      return merged;
    });

  } catch (err) {
    console.error('[ERROR] handleStaffPick unexpected error', err);
  }
};



  const onFooterSaveAndBack = () => {
    if (changeLog.length === 0) {
      showErrorToast(lang.no_changes_to_save);
      return;
    }
    if (addScheduleModalVisible) {
      showErrorToast("Please finish editing the schedule");
      return;
    }
    if (staffError || timeFromError || durationError) {
      showErrorToast("Please fix errors before saving");
      return;
    }
    if (!Array.isArray(changeLog) || changeLog.length === 0) {
      showErrorToast("No changes to save");
      return;
    }
    setSaveConfirmVisible(true);
  };

  const screenH = Dimensions.get("window").height;
  const screenW = Dimensions.get("window").width;
  const employeeList = localUsers.filter((u) => {
    const role = (u.role || "").toLowerCase();
    // Roles we consider "staff" for scheduling purposes. Extend if your backend uses other role names.
    const staffRoles = new Set(["employee", "user", "staff", "cashier", "worker", "clerk", "attendant"]);
    if (!staffRoles.has(role)) return false;
    if (effectiveBranchId) {
      return (u.branch_id ?? "") === effectiveBranchId;
    }
    return true;
  });

  const staffSuggestions = employeeList.filter((u) => {
    const q = (selectedStaff || "").toLowerCase();
    if (!q) return true;
    return (
      u.fullname.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q) ||
      (u.branch_id || "").toLowerCase().includes(q)
    );
  });

  const branchSuggestions = localBranches.filter((b) =>
    b.name.toLowerCase().includes((selectedBranch || "").toLowerCase()) ||
    b.id.toLowerCase().includes((selectedBranch || "").toLowerCase())
  );

  const onShowNativeTimePicker = () => setShowTimePicker(true);
  const onNativeTimeChange = (event: any, selected?: Date) => {
    setShowTimePicker(false);
    if (!selected) return;
    const hh = pad2(selected.getHours());
    const mm = pad2(selected.getMinutes());
    const ss = "00";
    setTimeFrom(`${hh}:${mm}:${ss}`);
    setTimeFromError("");
  };

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: route.params?.id ? (lang.Edit_Schedule) : (lang.Add_Schedule), color: colors.text }}
        left={[
          {
            type: "image",
            url: require("../../../../assets/icons/back_b.png"),
            width: 23,
            height: 23,
            onPress: () => navigation.goBack(),
          },
        ]}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} colors={[colors.primary]} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.scrollBody}>
          <View style={styles.group1}>
            <Text style={styles.groupTitle}>{lang.Schedule_details}</Text>
            <Text style={styles.groupSubtitle}>{lang.Create_new_work_schedule}</Text>
          </View>

          {/* Staff input */}
          <View
            ref={(r) => {
              staffInputWrapperRef.current = r;
            }}
            onLayout={() => {
              if (staffFilterOpen) setTimeout(measureStaffInput, 20);
            }}
          >
            <InputBox
              label={lang.staff_member}
              placeholder={lang.Select_staff_member}
              value={selectedStaff}
              setValue={(v: string) => {
                setSelectedStaff(v);
                setStaffError("");
                setSelectedStaffId(null);
                setStaffFilterOpen(true);
                setTimeout(measureStaffInput, 20);
              }}
              editable={true}
              onPress={undefined}
              rightIcon={require("../../../../assets/icons/a_staffrecord_b.png")}
              rightIconStyle={{ tintColor: colors.primary }}
              onRightIconPress={() => {
                if (!staffFilterOpen) {
                  // clear the typed query so suggestions show full list
                  setSelectedStaff('');
                  setSelectedStaffId(null);
                  setStaffFilterOpen(true);
                  setTimeout(measureStaffInput, 20);
                } else {
                  setStaffFilterOpen(false);
                  setStaffInputLayout(null);
                }
              }}
              errorMessage={staffError}
            />
          </View>
          <View style={{ marginTop: 0 }}>
            {weekDates.map((d) => {
              const ymd = dateToYMD(d);
              const dateNum = d.getDate();
              const wk = WEEKDAYS[d.getDay()];
              const daySchedules = localSchedulesByDate[ymd] || [];
              const staffSchedule = selectedStaffId ? daySchedules.find((s) => s.user_id === selectedStaffId) : null;
              const hasScheduleForStaff = !!staffSchedule;
              const expired = isBeforeToday(ymd);
              const displayTime = hasScheduleForStaff
                ? `${formatTime12(staffSchedule.start_time)} – ${formatTime12(staffSchedule.end_time || computeEndTime(staffSchedule.start_time, staffSchedule.duration))}`
                : null;
              const userObj = localUsers.find((uu) => uu.id === selectedStaffId) || null;
              const branchNameForSchedule = hasScheduleForStaff && userObj && staffSchedule.branch_id && (staffSchedule.branch_id !== userObj.branch_id)
                ? (localBranches.find((b) => b.id === staffSchedule.branch_id)?.name ?? "")
                : "";
              return (
                <View key={ymd} style={styles.each_day}>
                  <CartBox
                    width="auto"
                    containerStyle={[styles.day, expired ? { backgroundColor: colors.background, borderColor: colors.background } : {}]}
                  >
                    <Text style={styles.day_text}>{`${dateNum}`}</Text>
                    <Text style={styles.day_text}>{`${wk}`}</Text>
                  </CartBox>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    activeOpacity={expired ? 1 : 0.8}
                    onPress={() => { if (expired) return; openAddModalForDate(ymd); }}
                  >
                    <CartBox width="auto" containerStyle={[styles.time, expired ? { backgroundColor: colors.background, borderColor: colors.background } : {}]}>
                      {hasScheduleForStaff ? (
                        <View style={{ alignItems: 'center' }}>
                          {branchNameForSchedule ?
                            <View style={{ flexDirection: 'row', marginBottom: 4, width: '80%' }}>
                              <Image source={require("../../../../assets/icons/branch_b.png")} style={styles.branch} />
                              <Text style={styles.branch_name} ellipsizeMode="tail" numberOfLines={1}>{branchNameForSchedule}</Text>
                            </View>
                            : null}
                          <View style={{ flexDirection: 'row' }}>
                            <Image source={require("../../../../assets/icons/clock_b.png")} style={styles.clock} />
                            <Text style={styles.time_text}>{displayTime}</Text>
                          </View>
                        </View>
                      ) : (
                        <Image source={require("../../../../assets/icons/plus_b.png")} style={styles.plus} />
                      )}
                    </CartBox>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          <View style={{ height: 0 }} />
        </View>
      </ScrollView>
      <View style={styles.footerButtonWrap}>
        <Button1 text={route.params?.id ? (lang.Save_Changes) : (lang.Add_Schedule)} width={"100%"} onPress={onFooterSaveAndBack} />
      </View>

      {/* Add Schedule Modal (unchanged except branch suggestion overlay uses normalized branch data) */}
      <Modal animationType="slide" transparent visible={addScheduleModalVisible} onRequestClose={() => { setAddScheduleModalVisible(false); setModalEditingId(null); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { setAddScheduleModalVisible(false); setModalEditingId(null); }}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{modalEditingId ? lang.Edit_Schedule : lang.Add_Schedule}</Text>
            <View>
              <ScrollView style={{ marginTop: 8, maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                <View
                  ref={(r) => { branchInputWrapperRef.current = r; }}
                  onLayout={onBranchLayout}
                >
                  <InputBox
                    label={lang.Branch}
                    placeholder={"Select branch"}
                    value={selectedBranch}
                    setValue={(v: string) => {
                      setSelectedBranch(v);
                      setSelectedBranchId(null);
                      setBranchFilterOpen(true);
                      setTimeout(() => {
                        if (!branchInputLayout) {
                          const handle = findNodeHandle(branchInputWrapperRef.current);
                          if (handle) {
                            UIManager.measure(handle, (x, y, width, height, pageX, pageY) => {
                              setBranchInputLayout({ x: pageX, y: pageY, width, height });
                            });
                          }
                        }
                      }, 30);
                    }}
                    onPress={undefined}
                    rightIcon={require("../../../../assets/icons/branch_b.png")}
                    rightIconStyle={{ tintColor: colors.primary }}
                    onRightIconPress={() => {
                      setBranchFilterOpen((s) => !s);
                      setTimeout(() => {
                        if (!branchInputLayout) {
                          const handle = findNodeHandle(branchInputWrapperRef.current);
                          if (handle) {
                            UIManager.measure(handle, (x, y, width, height, pageX, pageY) => {
                              setBranchInputLayout({ x: pageX, y: pageY, width, height });
                            });
                          }
                        }
                      }, 30);
                    }}
                    errorMessage={""}
                  />
                </View>

                <InputBox
                  label={lang.Start_time}
                  placeholder={"00:00:00"}
                  value={timeFrom}
                  setValue={(v: string) => {
                    setTimeFrom(v);
                    const ok = /^(\d{2}):(\d{2}):(\d{2})$/.test(v);
                    if (ok) setTimeFromError("");
                  }}
                  rightIcon={require("../../../../assets/icons/clock_b.png")}
                  errorMessage={timeFromError}
                  rightIconStyle={{ tintColor: colors.primary }}
                  onRightIconPress={onShowNativeTimePicker}
                  onPress={onShowNativeTimePicker}
                />

                <InputBox
                  label={lang.Duration}
                  placeholder={"Eg: 8"}
                  value={durationHours}
                  setValue={(v: string) => { setDurationHours(v.replace(/[^0-9.]/g, "")); setDurationError(""); }}
                  errorMessage={durationError}
                  rightIconStyle={{ tintColor: colors.primary }}
                />

                <View style={{ height: 18 }} />
                <Button1 text={modalEditingId ? lang.save : lang.Add} width={"100%"} onPress={onAddSchedule} />
                <View style={{ height: 20 }} />
              </ScrollView>

              {branchFilterOpen && branchInputLayout && (
                <Pressable style={[styles.modalOverlayAbsolute]} onPress={() => setBranchFilterOpen(false)}>
                  <View
                    style={[
                      styles.overlayContainer,
                      {
                        left: Math.max(branchInputLayout.x),
                        top: Math.max(branchInputLayout.y + branchInputLayout.height),
                        width: Math.min(branchInputLayout.width, Dimensions.get("window").width - 32),
                        maxHeight: 300,
                      },
                    ]}
                  >
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {branchSuggestions.length === 0 ? (
                        <Text style={{ textAlign: "center", color: colors.text, padding: 12 }}>No matches</Text>
                      ) : (
                        branchSuggestions.map((b) => (
                          <Pressable key={b.id} style={styles.suggestionItemInline} onPress={() => {
                            setSelectedBranch(b.name);
                            setSelectedBranchId(b.id);
                            setBranchFilterOpen(false);
                          }}>
                            <Text style={styles.suggestionText}>{b.name}</Text>
                          </Pressable>
                        ))
                      )}
                    </ScrollView>
                  </View>
                </Pressable>
              )}
            </View>
          </View>
        </Pressable>
      </Modal>
      {showTimePicker && (
        <DateTimePicker
          value={timeStringToDate(timeFrom)}
          mode="time"
          is24Hour={true}
          display={Platform.OS === "ios" ? "spinner" : "clock"}
          onChange={onNativeTimeChange}
        />
      )}

      {staffFilterOpen && staffInputLayout && (
        <Pressable
          style={styles.overlayBackdrop}
          onPress={() => {
            setStaffFilterOpen(false);
            setStaffInputLayout(null);
          }}
        >
          <View
            style={[
              styles.overlayContainer,
              {
                left: Math.max(8, staffInputLayout.x),
                top: Math.max(8, staffInputLayout.y + 25),
                width: Math.min(staffInputLayout.width, screenW),
                maxHeight: 300,
              },
            ]}
          >
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {staffSuggestions.length === 0 ? (
                <Text style={{ textAlign: "center", color: colors.search, padding: 12 }}>No matches</Text>
              ) : (
                staffSuggestions.map((u) => (
                  <Pressable
                    key={u.id}
                    style={styles.suggestionItemInline}
                    onPress={() => handleStaffPick(u)}
                  >
                    <Text style={styles.suggestionText}>{u.fullname}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </Pressable>
      )}
      <Toast config={toastConfig} />
      <Popup
        visible={saveConfirmVisible}
        onClose={() => setSaveConfirmVisible(false)}
        dismissOnOverlayPress={false}
        title={lang.Confirm_saving_of_staff_work_schedule || "Confirm saving of staff’s work schedule."}
        titleStyle={{ color: colors.primary, marginBottom: 30, fontSize: fonts.size.m, fontWeight: fonts.weight.regular as any }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
          <Button1
            text={lang.yes || "Yes"}
            onPress={() => {
              setSaveConfirmVisible(false);
              try {
                navigation.navigate("WorkScheduleScreen" as any, { userId, langId, changes: changeLog });
              } catch (e) {
                console.warn("navigate to WorkScheduleScreen failed", e);
              }
              navigation.goBack();
            }}
            backgroundColor={colors.primary}
            width={'48%'}
            textStyle={{ color: colors.secondary }}
          />
          <Button1
            text={lang.no || "No"}
            onPress={() => setSaveConfirmVisible(false)}
            backgroundColor={colors.error_text}
            width={'48%'}
            textStyle={{ color: colors.secondary }}
          />
        </View>
      </Popup>
    </View>
  );
}

/* Styles */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.secondary },
  scrollContainer: { paddingBottom: 0 },
  scrollBody: { backgroundColor: colors.secondary, paddingTop: 20, paddingHorizontal: 20, paddingBottom: "25%" },
  group1: { marginBottom: 20 },
  groupTitle: { color: colors.text, fontWeight: fonts.weight.regular as any, fontSize: fonts.size.m },
  groupSubtitle: { color: colors.search, fontWeight: fonts.weight.regular as any, fontSize: fonts.size.s, marginTop: 6 },

  /* modal styles reused from your other screens */
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalOverlayAbsolute: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  modalContainer: {
    backgroundColor: colors.secondary,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHandle: { width: 40, height: 6, backgroundColor: colors.modal_line, borderRadius: 10, alignSelf: "center", marginBottom: 12 },
  modalTitle: { fontSize: fonts.size.l, fontWeight: fonts.weight.medium as any, textAlign: "center", marginBottom: 8 },

  footerButtonWrap: { position: "absolute", left: 20, right: 20, bottom: 0, paddingTop: 10, paddingBottom: 30, backgroundColor: colors.secondary },
  each_day: { flexDirection: "row", width: '100%', marginBottom: 20, alignItems: "center", },
  day: { borderColor: colors.primary, borderWidth: 1, borderRadius: 12, backgroundColor: colors.secondary, marginRight: 10, paddingTop: 11, paddingBottom: 11, width: 52, alignItems: "center" },
  day_text: { color: colors.primary, fontSize: fonts.size.s, fontWeight: fonts.weight.regular as any },
  time: {
    borderColor: colors.primary,
    borderWidth: 1, borderRadius: 12,
    backgroundColor: colors.secondary, flex: 1, justifyContent: "center", alignItems: 'center'
  },
  plus: { width: 16, height: 16 },

  // overlay (full-screen pressable backdrop)
  overlayBackdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  overlayContainer: {
    position: "absolute",
    backgroundColor: colors.secondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    // shadow
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  suggestionItemInline: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionText: { color: colors.text, fontSize: fonts.size.m },
  branch: {
    width: 16, height: 16, marginRight: 4
  },
  branch_name: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
    color: colors.primary,

  },
  time_text: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular as any,
    color: colors.primary,
  },
  clock: { width: 14, height: 14, marginRight: 4 },
});
