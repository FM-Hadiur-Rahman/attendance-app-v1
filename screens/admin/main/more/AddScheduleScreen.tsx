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
import { fetchUsers, ProfileUser, getProfile } from "../../../../api/profile"; // fetchUsers returns { users, page, ... }
import { getAllBranches, Branch as ApiBranch } from "../../../../api/Branchs";
import { getEmployeeSchedules, getSchedules, ScheduleItem, postSchedulesBulk } from "../../../../api/schedules";
//notification
import { sendNotificationToUser } from "../../../../api/notification/firebaseNotifications";
import { db, addDoc, collection, serverTimestamp } from "../../../../api/notification/firebase";
import Header from "../../../../components/Header";
import colors from "../../../../styles/Colors";
import CartBox from "../../../../components/CartBox";
import { Button1 } from "../../../../components/Button";
import fonts from "../../../../styles/Fonts";
import InputBox from "../../../../components/InputBox";
import translations from "../../../../assets/translations.json";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../../components/Toast";
import Popup from "../../../../components/Popup";
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
  const [selectedDayYmd, setSelectedDayYmd] = useState<string | null>(null); // template origin date (may be previous-week)
  const [selectedDisplayYmd, setSelectedDisplayYmd] = useState<string | null>(null); // the actual date we want to create/edit (usually current-week)
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
      let branchToUse: string | undefined = screenBranchId || undefined;
      try {
        const profile = await getProfile();
        const profBranch = typeof profile.branch === 'string' ? profile.branch : profile.branch?._id ?? undefined;
        if (!branchToUse && profBranch) branchToUse = profBranch;
        console.log("getProfile() returned branch:", profBranch);
      } catch (err) {
        console.warn('getProfile() failed, falling back to screenBranchId if provided', err);
      }
      setEffectiveBranchId(branchToUse ?? "");
      console.log("loadInitialData -> branchToUse:", branchToUse);
      const branches = await getAllBranches();
      console.log("getAllBranches raw:", branches);
      const normalizedBranches = normalizeBranches(branches || []);
      setLocalBranches(normalizedBranches);
      const usersResp = await fetchUsers({ branchId: branchToUse || undefined, limit: 1000 });
      console.log("fetchUsers raw:", usersResp);
      const fetchedUsers = usersResp?.users ?? [];
      const normalizedUsers = normalizeUsers(fetchedUsers);
      setLocalUsers(normalizedUsers);
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
  }, [screenBranchId]);
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
  const weekDates = getWeekDates(weekOffset);
  const displayWeekDates = getWeekDates(0);
  const buildMapFromList = (list: any[]) => {
    const map: Record<string, any[]> = {};
    (list || []).forEach((s) => {
      if (!s?.date) return;
      const dateKey = String(s.date).split("T")[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(s);
    });
    return map;
  };
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
  // return "HH:MM" trimmed (input may be "HH:MM:SS" or "HH:MM")
  const timeToHHMM = (t: string) => {
    if (!t) return "";
    const parts = String(t).split(":");
    if (parts.length >= 2) return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
    return t;
  };
  const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayOfWeekFromYmd = (ymd: string) => {
    try {
      const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
      const dt = new Date(y, m - 1, d);
      return WEEKDAY_FULL[dt.getDay()] || "";
    } catch (e) {
      return "";
    }
  };
  const computeDurationFromStartEnd = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const toSeconds = (t: string) => {
      const parts = t.split(':').map((p) => parseInt(p, 10) || 0);
      const hh = parts[0] || 0;
      const mm = parts[1] || 0;
      const ss = parts[2] || 0;
      return hh * 3600 + mm * 60 + ss;
    };
    const sSec = toSeconds(start);
    const eSec = toSeconds(end);
    let diff = eSec - sSec;
    if (diff < 0) diff += 24 * 3600;
    const hours = diff / 3600;
    return Math.round(hours * 100) / 100;
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
    // target date should be the displayed/current-week date (fallback to template date)
    const targetDate = selectedDisplayYmd || selectedDayYmd || null;
    let normalizedDate = String(targetDate).split("T")[0];
    if (!normalizedDate) {
      showErrorToast("No valid date selected for schedule (abort)");
      console.error("[AddSchedule] abort: targetDate is null", { weekOffset, selectedDayYmd, selectedDisplayYmd });
      return;
    }
    const payload: any = {
      user_id: selectedStaffId,
      start_time: timeFrom,
      duration: dur,
      branch_id: selectedBranchId,
      date: normalizedDate,
    };
    if (modalEditingId) payload.id = modalEditingId;
    // helper: rebuild date keyed map from a schedule list
    const buildMapFromList = (list: any[]) => {
      const map: Record<string, any[]> = {};
      (list || []).forEach((s) => {
        if (!s?.date) return;
        const dateKey = String(s.date).split("T")[0];
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(s);
      });
      return map;
    };
    // Helper: create a temporary schedule object (consistent shape)
    const makeTempSchedule = (base: any, overrideId?: string) => {
      const id = overrideId ?? `S${(Math.max(0, ...(localSchedules || []).map((x) => {
        const m = String(x.id || "").match(/^S(\d+)$/);
        return m ? Number(m[1]) : 0;
      })) + 1).toString().padStart(3, "0")}`;
      return {
        id,
        user_id: base.user_id,
        start_time: base.start_time,
        duration: base.duration,
        date: base.date,
        branch_id: base.branch_id,
        createDate: base.createDate ?? new Date().toISOString(),
        updateDate: new Date().toISOString(),
      } as any;
    };
    if (typeof route.params?.onSave === "function") {
      try {
        route.params.onSave(payload);
        showSuccessToast(modalEditingId ? lang.schedule_updated || "Schedule updated" : lang.schedule_added || "Schedule added");
      } catch (e) {
        console.warn("onSave callback threw:", e);
      }
      setLocalSchedules((prev = []) => {
        const copy = prev.map((p) => ({ ...p }));
        if (payload.id) {
          const idx = copy.findIndex((s) => String(s.id) === String(payload.id));
          if (idx !== -1) {
            const updated = { ...copy[idx], ...payload, updateDate: new Date().toISOString() };
            if (!updated.raw && copy[idx].raw) updated.raw = copy[idx].raw;
            copy[idx] = updated;
            setChangeLog((c) => [...c, { type: "update", schedule: updated }]);
          } else {
            const newSch = makeTempSchedule(payload);
            copy.push(newSch);
            setChangeLog((c) => [...c, { type: "add", schedule: newSch }]);
          }
        } else {
          // create
          const newSch = makeTempSchedule(payload);
          copy.push(newSch);
          setChangeLog((c) => [...c, { type: "add", schedule: newSch }]);
        }
        // rebuild map used by UI
        const map = buildMapFromList(copy);
        setLocalSchedulesByDate(map);
        console.info("[AddSchedule] localSchedules updated, total:", copy.length, "dateKey:", payload.date);
        return copy;
      });
      // close modal
      setAddScheduleModalVisible(false);
      setModalEditingId(null);
      // ensure current week is visible if we created/updated for current week
      const cwDates = displayWeekDates.map((d) => dateToYMD(d));
      if (targetDate && cwDates.includes(targetDate)) {
        setWeekOffset(0);
      }
      return;
    }
    // No route callback — update local state and changeLog locally
    if (!modalEditingId) {
      // create new temp schedule
      const newSch = makeTempSchedule({ ...payload });
      // ensure date normalized in temp
      newSch.date = normalizedDate;
      setLocalSchedules((prev = []) => {
        const merged = [...prev, newSch];
        const map = buildMapFromList(merged);
        setLocalSchedulesByDate(map);
        return merged;
      });
      setChangeLog((c) => [...c, { type: "add", schedule: newSch }]);
      showSuccessToast("Schedule added");
    } else {
      // update existing
      setLocalSchedules((prev = []) => {
        const copy = prev.map((s) => ({ ...s }));
        const idx = copy.findIndex((sch) => String(sch.id) === String(modalEditingId));
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
        } else {
          // if not found, push as new
          const newSch = makeTempSchedule({ ...payload });
          newSch.date = normalizedDate;
          copy.push(newSch);
          setChangeLog((c) => [...c, { type: "add", schedule: newSch }]);
        }
        const map = buildMapFromList(copy);
        setLocalSchedulesByDate(map);
        return copy;
      });
      showSuccessToast("Schedule updated");
    }
    // close modal & ensure week view
    setAddScheduleModalVisible(false);
    setModalEditingId(null);
    const cwDates = displayWeekDates.map((d) => dateToYMD(d));
    if (targetDate && cwDates.includes(targetDate)) {
      setWeekOffset(0);
    }
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
  const openAddModalForDate = (dataYmd: string, displayYmd?: string) => {
    const uiYmd = displayYmd || dataYmd;
    if (isBeforeToday(uiYmd)) return;
    if (!selectedStaffId) {
      setStaffError(lang.Select_staff || "Please select staff first");
      showErrorToast(lang.Please_select_staff || "Select staff first");
      setStaffFilterOpen(true);
      setTimeout(measureStaffInput, 40);
      return;
    }
    const daySchedules = localSchedulesByDate[dataYmd] || [];
    const staffSchedule = daySchedules.find((s) => s.user_id === selectedStaffId) || null;
    setSelectedDayYmd(dataYmd); // template origin
    setSelectedDisplayYmd(uiYmd); // date we want to actually create/edit
    setDurationError("");
    setTimeFromError("");
    if (staffSchedule) {
      // Prefill fields from template (previous-week schedule)
      setTimeFrom(staffSchedule.start_time || "");
      const durFromApi = staffSchedule.duration ?? null;
      const endFromApi = staffSchedule.end_time ?? staffSchedule.end ?? "";
      let finalDuration = 0;
      if (typeof durFromApi === "number" && !isNaN(durFromApi) && durFromApi > 0) {
        finalDuration = Number(durFromApi);
      } else if (endFromApi && staffSchedule.start_time) {
        finalDuration = computeDurationFromStartEnd(staffSchedule.start_time, endFromApi);
      } else {
        finalDuration = 0;
      }
      setDurationHours(finalDuration ? String(finalDuration) : "");
      const br = localBranches.find((b) => b.id === staffSchedule.branch_id);
      if (br) {
        setSelectedBranch(br.name);
        setSelectedBranchId(br.id);
      } else {
        setSelectedBranch("");
        setSelectedBranchId(null);
      }
      if (typeof weekOffset === "number" && weekOffset !== 0) {
        // user is explicitly viewing a previous/older week — edit that template
        setModalEditingId(staffSchedule.id || null);
      } else {
        // current-week UI: only edit when the template actually belongs to this UI date
        if (staffSchedule.date && staffSchedule.date === uiYmd) {
          setModalEditingId(staffSchedule.id || null);
        } else {
          setModalEditingId(null); // treat as NEW schedule (create) for current-week
        }
      }
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
      const br = localBranches.find((b) => b.id === u.branch_id);
      if (br) {
        setSelectedBranch(br.name);
        setSelectedBranchId(br.id);
      } else {
        setSelectedBranch("");
        setSelectedBranchId(null);
      }
      if (!u.id) return;
      // unwrap various API shapes
      const unwrapSchedules = (resp: any): any[] => {
        if (!resp) return [];
        if (Array.isArray(resp)) return resp;
        if (Array.isArray(resp.schedules)) return resp.schedules;
        if (resp.data && Array.isArray(resp.data.schedules)) return resp.data.schedules;
        return [];
      };
      const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const toLocalYmdFromIso = (iso?: string) => {
        if (!iso) return "";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      };
      const maxLookbackWeeks = 6;
      const fetchWeekForOffset = async (offsetWeeks: number) => {
        const weekDates = getWeekDates(offsetWeeks).map((d) => dateToYMD(d));
        const start = weekDates[0];
        const end = weekDates[weekDates.length - 1];
        console.log(`[DEBUG] fetchWeekForOffset offset=${offsetWeeks} start=${start} end=${end}`);
        const resp = await getEmployeeSchedules(u.id, start, end);
        console.log(`[DEBUG] raw resp for offset=${offsetWeeks}`, resp);
        const rawArr = unwrapSchedules(resp) || [];
        // debug list: id, iso, localYmd
        const debugList = rawArr.map((r: any) => {
          const iso = r?.date ?? r?.day ?? r?.createdAt ?? null;
          return { id: r?._id ?? r?.id, iso, localYmd: toLocalYmdFromIso(iso) };
        });
        console.log(`[DEBUG] raw items (id, iso, localYmd) for offset=${offsetWeeks}`, debugList);
        // filter raw arr by localYmd inside [start..end]
        const filtered = rawArr.filter((r: any) => {
          const iso = r?.date ?? r?.day ?? r?.createdAt ?? null;
          const localYmd = toLocalYmdFromIso(iso);
          if (!localYmd) return false;
          return localYmd >= start && localYmd <= end;
        });
        console.log(`[DEBUG] filtered.length for offset=${offsetWeeks} =`, filtered.length, "ids:", filtered.map((f: any) => f._id ?? f.id));
        // normalize and return
        return normalizeSchedules(filtered || []);
      };
      // QUICK LOCAL CHECK: if localSchedulesByDate already contains current-week entries for this user, use them
      const currentWeekDates = getWeekDates(0).map((d) => dateToYMD(d));
      let localHasCurrent = false;
      for (const ymd of currentWeekDates) {
        const arr = localSchedulesByDate[ymd] || [];
        if (arr.some((s) => String(s.user_id) === String(u.id))) {
          localHasCurrent = true;
          break;
        }
      }
      if (localHasCurrent) {
        console.log("[DEBUG] handleStaffPick: using local current-week schedules (no fetch)");
        setWeekOffset(0);
        console.info(`[INFO] Showing current week schedules for ${u.id} (from local state)`);
        return;
      }
      // search current then older weeks
      let found = false;
      let chosenOffset = 0;
      let finalSchedulesNormalized: any[] = [];
      try {
        const cur = await fetchWeekForOffset(0);
        if (cur.length > 0) {
          found = true;
          chosenOffset = 0;
          finalSchedulesNormalized = cur;
        } else {
          console.log("[DEBUG] no current-week remote items");
        }
      } catch (e) {
        console.warn("[WARN] fetch current week failed", e);
      }
      if (!found) {
        for (let i = 1; i <= maxLookbackWeeks; i++) {
          try {
            const off = -i;
            const items = await fetchWeekForOffset(off);
            if (items.length > 0) {
              found = true;
              chosenOffset = off;
              finalSchedulesNormalized = items;
              break;
            }
          } catch (e) {
            console.warn(`[WARN] fetch offset ${-i} failed`, e);
          }
        }
      }
      if (found) {
        console.log(`[DEBUG] handleStaffPick: found schedules at offset ${chosenOffset}`);
        setWeekOffset(chosenOffset);
        console.info(`[INFO] Showing ${chosenOffset === 0 ? "current" : `week offset ${chosenOffset}`} schedules for ${u.id}`);
      } else {
        // nothing found -> stay current (empty)
        setWeekOffset(0);
        console.info(`[INFO] No schedules found within ${maxLookbackWeeks} weeks; staying on current week for ${u.id}`);
      }
      setLocalSchedules((existing) => {
        // re-normalize existing items to get consistent { id, user_id, date, ... }
        const existingNormalized = normalizeSchedules((existing || []).map((e: any) => e.raw ?? e));
        const byId: Record<string, any> = {};
        existingNormalized.forEach((s) => {
          if (s && s.id) byId[s.id] = s;
        });
        (finalSchedulesNormalized || []).forEach((s) => {
          if (s && s.id) byId[s.id] = s;
        });
        const mergedNormalized = Object.values(byId);
        // rebuild map keyed by local YMD
        const map: Record<string, any[]> = {};
        mergedNormalized.forEach((s) => {
          if (!s?.date) return;
          const dateKey = s.date; // already YYYY-MM-DD from normalizeSchedules
          if (!map[dateKey]) map[dateKey] = [];
          map[dateKey].push(s);
        });
        setLocalSchedulesByDate(map);
        console.log("[DEBUG] handleStaffPick: merged total =", mergedNormalized.length, "dateKeys =", Object.keys(map));
        return mergedNormalized;
      });
    } catch (err) {
      console.error("[ERROR] handleStaffPick unexpected error", err);
    }
  };
  const onFooterSaveAndBack = () => {
    // 1. If add/edit modal is open, finish it first
    if (addScheduleModalVisible) {
      showErrorToast("Please finish editing the schedule");
      return;
    }
    // 2. Check for field errors
    if (staffError || timeFromError || durationError) {
      showErrorToast("Please fix errors before saving");
      return;
    }
    // 3. Check if there are any real changes in changeLog
    const hasChanges = Array.isArray(changeLog) && changeLog.length > 0;
    // ✅ 4. If no changes in changeLog, still check if any new schedules exist for current week
    const currentWeekDates = getWeekDates(0).map((d) => dateToYMD(d));
    const newCurrentWeekSchedules = localSchedules.filter(
      (s) =>
        !s.id?.startsWith("S") || // temp IDs we generate for new schedules
        currentWeekDates.includes(s.date)
    );
    if (!hasChanges && newCurrentWeekSchedules.length === 0) {
      showErrorToast(lang.no_changes_to_save);
      return;
    }
    // 5. Show confirmation
    setSaveConfirmVisible(true);
  };
  const screenH = Dimensions.get("window").height;
  const screenW = Dimensions.get("window").width;
  const employeeList = localUsers.filter((u) => {
    const role = (u.role || "").toLowerCase();
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
        center={{ type: "text", value:lang.Add_Schedule}}
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
            {Array.from({ length: 7 }).map((_, idx) => {
              const displayD = displayWeekDates[idx]; // current-week date for showing number & weekday
              const dataD = weekDates[idx]; // schedule lookup date (may be offset week)
              const displayYmd = dateToYMD(displayD); // for UI/expired logic
              const ymd = dateToYMD(dataD); // for schedule lookup
              const dateNum = displayD.getDate();
              const wk = WEEKDAYS[displayD.getDay()];
              const daySchedules = localSchedulesByDate[ymd] || []; // 查找 schedule by data-week ymd
              const staffSchedule = selectedStaffId ? daySchedules.find((s) => s.user_id === selectedStaffId) : null;
              const hasScheduleForStaff = !!staffSchedule;
              const expired = isBeforeToday(displayYmd); // expired 判定 use display date
              const displayTime = hasScheduleForStaff
                ? `${formatTime12(staffSchedule.start_time)} – ${formatTime12(staffSchedule.end_time || computeEndTime(staffSchedule.start_time, staffSchedule.duration))}`
                : null;
              const userObj = localUsers.find((uu) => uu.id === selectedStaffId) || null;
              const branchNameForSchedule = hasScheduleForStaff && userObj && staffSchedule.branch_id && (staffSchedule.branch_id !== userObj.branch_id)
                ? (localBranches.find((b) => b.id === staffSchedule.branch_id)?.name ?? "")
                : "";
              return (
                <View key={`${ymd}_${displayYmd}`} style={styles.each_day}>
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
                    onPress={() => {
                      if (expired) return;
                      openAddModalForDate(ymd, displayYmd);
                    }}
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
      <Modal animationType="slide" transparent visible={addScheduleModalVisible} onRequestClose={() => { setAddScheduleModalVisible(false); setModalEditingId(null); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { setAddScheduleModalVisible(false); setModalEditingId(null); }} pointerEvents="auto">
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}> {lang.Add_Schedule}</Text>
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
                      setSelectedBranch("");
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
                <Button1 text={lang.Add} width={"100%"} onPress={onAddSchedule} />
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
    
    {/* ---------- POPUP: saves schedules + per-day notifications to employee + only target-branch admins ---------- */}
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
      onPress={async () => {
        // close dialog immediately
        setSaveConfirmVisible(false);
        try {
          setLoading(true);
          // 1) Gather user changes + templates (deep clone)
          const userChanges = (changeLog || [])
            .filter((c) => c.type === "add" || c.type === "update")
            .map((c) => ({ ...JSON.parse(JSON.stringify(c.schedule)) }));
          const prevWeekSchedules = Object.values(localSchedulesByDate)
            .flat()
            .filter((s) => s.user_id === selectedStaffId)
            .map((s) => JSON.parse(JSON.stringify(s)));
          // 2) Map previous-week templates' day-of-week to current-week dates
          const currentWeekDayMap: Record<string, string> = {};
          displayWeekDates.forEach((d) => {
            const dow = WEEKDAYS[d.getDay()];
            currentWeekDayMap[dow] = dateToYMD(d);
          });
          const prevToCurrentWeekSchedules = prevWeekSchedules
            .map((s) => {
              const prevDow = WEEKDAYS[new Date(s.date).getDay()];
              const targetDate = currentWeekDayMap[prevDow];
              if (!targetDate) return null;
              return { ...s, date: targetDate };
            })
            .filter(Boolean);
          const userChangeKeys = new Set(userChanges.map((u) => `${u.user_id}-${u.date}`));
          let templatesToKeep = prevToCurrentWeekSchedules.filter((t) => {
            const key = `${t.user_id}-${t.date}`;
            return !userChangeKeys.has(key);
          });
          let schedulesToSaveRaw = [...templatesToKeep, ...userChanges];
          const currentWeekDatesYMD = displayWeekDates.map((d) => dateToYMD(d));
          schedulesToSaveRaw = schedulesToSaveRaw.filter((s) => currentWeekDatesYMD.includes(s.date));
          // 3) normalize start/end for dedupe
          const normalizeForDedupe = (s: any) => {
            const startRaw = s.start_time ?? s.start ?? s.from_time ?? "";
            const computedEnd = s.end_time ?? s.end ?? (s.duration && startRaw ? computeEndTime(startRaw, Number(s.duration)) : "");
            const start = timeToHHMM(String(startRaw));
            const end = timeToHHMM(String(computedEnd));
            return {
              ...s,
              start_time: start,
              end_time: end,
              _dedupeStart: start,
              _dedupeEnd: end,
            };
          };
          const normalizedList = schedulesToSaveRaw.map(normalizeForDedupe);
          // 4) dedupe
          const seen = new Set<string>();
          const deduped = normalizedList.filter((s) => {
            const branchId = s.branch_id ?? s.branch ?? "";
            const key = `${s.user_id}-${s.date}-${s._dedupeStart}-${s._dedupeEnd}-${branchId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          // final schedules to save (strip helpers)
          const schedulesToSave = deduped.map((s) => {
            const copy = { ...s };
            delete copy._dedupeStart;
            delete copy._dedupeEnd;
            return copy;
          });
          if (schedulesToSave.length === 0) {
            showErrorToast(lang.no_changes_to_save || "No changes to save");
            setLoading(false);
            return;
          }
          // employeeId fallback + branch fallback (used when schedule item lacks branch_id)
          const employeeIdToUse = selectedStaffId || userId || (schedulesToSave[0]?.user_id ?? "");
          const defaultBranchIdToUse = selectedBranchId || effectiveBranchId || (schedulesToSave[0]?.branch_id ?? "");
          // 5) Build final payload in "date/day/start/end" shape the backend expects
          const schedulesPayload = schedulesToSave.map((s) => {
            const dateYmd = s.date;
            const startRaw = s.start_time ?? s.start ?? s.from_time ?? "";
            const endRaw = s.end_time ?? s.end ?? (s.duration && startRaw ? computeEndTime(startRaw, Number(s.duration)) : "");
            return {
              date: dateYmd,
              day_of_week: dayOfWeekFromYmd(dateYmd),
              start_time: timeToHHMM(startRaw),
              end_time: timeToHHMM(endRaw),
            };
          });
          if (schedulesPayload.length === 0) {
            showErrorToast("No valid schedules to create");
            setLoading(false);
            return;
          }
          // 6) Save schedules to backend
          const resp = await postSchedulesBulk(employeeIdToUse, defaultBranchIdToUse, schedulesPayload);
          console.log("[sched] postSchedulesBulk resp:", resp);
          // helper formatters (for notification body)
          const formatTime12 = (hhmmss: string) => {
            if (!hhmmss) return "";
            const parts = String(hhmmss).split(":").map((p) => parseInt(p, 10) || 0);
            let hh = parts[0] ?? 0;
            const mm = parts[1] ?? 0;
            const ampm = hh >= 12 ? "PM" : "AM";
            hh = hh % 12;
            if (hh === 0) hh = 12;
            return `${hh}:${String(mm).padStart(2, "0")} ${ampm}`;
          };
          const formatDateReadable = (ymd: string) => {
            if (!ymd) return "";
            const [y, m, d] = String(ymd).split("-").map((v) => parseInt(v, 10));
            if (!y || !m || !d) return ymd;
            const dt = new Date(y, m - 1, d);
            return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
          };
          // Helper to resolve employee object and original branch id (source)
          const employeeObj = localUsers.find((u) => String(u.id) === String(employeeIdToUse)) || null;
          const employeeBranchId = employeeObj?.branch_id ?? (employeeObj?.raw?.branch?._id ?? employeeObj?.raw?.branch?.id) ?? null;
          const employeeName = employeeObj?.fullname || (employeeObj?.raw?.fullname ?? employeeIdToUse);
          // 7) NOTIFICATIONS: send **per-schedule** notifications (one per date).
          // Use per-schedule branch if available; otherwise fallback to defaultBranchIdToUse.
          for (const s of schedulesToSave) {
            try {
              const targetBranchId = s.branch_id ?? s.branch ?? defaultBranchIdToUse ?? "";
              const start = timeToHHMM(s.start_time ?? s.start ?? s.from_time ?? "");
              const end = timeToHHMM(s.end_time ?? s.end ?? "");
              const date = s.date;
              const startFmt = formatTime12(start);
              const endFmt = formatTime12(end);
              const dateReadable = formatDateReadable(date);
              const timePart = startFmt && endFmt ? `${startFmt} - ${endFmt}` : (startFmt || endFmt || "");
              // employee notification (always send per-day)
              try {
                const assignedBranchName = (localBranches.find(b => String(b.id) === String(targetBranchId))?.name) || "";
                const empBody =
                  targetBranchId && employeeBranchId && String(targetBranchId) !== String(employeeBranchId)
                    ? `New Shift assigned at Branch: ${assignedBranchName} for Date: ${dateReadable}, Time: ${timePart},`
                    : `New Shift assigned for Date: ${dateReadable}, Time: ${timePart},`;
                await sendNotificationToUser(employeeIdToUse, {
                  title: "Shift Assigned",
                  body: empBody,
                  type: "shift_assigned",
                  meta: {
                    branchId: targetBranchId || null,
                    date,
                    start_time: start,
                    end_time: end,
                  },
                });
                console.log("[sched] notified employee for date", date, employeeIdToUse);
              } catch (e) {
                console.warn("[sched] sendNotificationToUser (employee) failed for date", date, e);
              }
              // admin notification: ONLY for admins of targetBranchId (and only if different from employee's own branch)
              if (targetBranchId && String(targetBranchId) !== String(employeeBranchId)) {
                let branchAdmins: any[] = [];
                // 1) Preferred: fetch admins for that branch using fetchUsers API with role filter
                try {
                  const fetched = await fetchUsers({ branchId: targetBranchId, role: 'admin', limit: 1000 });
                  const fetchedList = fetched?.users ?? fetched?.data ?? [];
                  const normalized = normalizeUsers(Array.isArray(fetchedList) ? fetchedList : []);
                  branchAdmins = normalized.filter((u: any) => {
                    const role = (u.role || "").toString().toLowerCase();
                    return role === "admin" || role === "branch_admin" || role.includes("admin") || role === "manager";
                  });
                  console.log("[sched] fetched branch admins via API:", branchAdmins.map((a: any) => a.id));
                } catch (e) {
                  console.warn("[sched] fetchUsers(role=admin) failed for branch", targetBranchId, e);
                }
                // 2) Fallback: if none found, try localUsers filter (existing cache)
                if ((!branchAdmins || branchAdmins.length === 0) && Array.isArray(localUsers) && localUsers.length > 0) {
                  branchAdmins = localUsers.filter((u: any) => {
                    const uBranch = u.branch_id ?? (u.raw?.branch?._id ?? u.raw?.branch?.id) ?? "";
                    const role = (u.role ?? u.raw?.role ?? "").toString().toLowerCase();
                    const isAdmin = role === "admin" || role === "branch_admin" || role.includes("admin") || role === "manager";
                    return String(uBranch) === String(targetBranchId) && isAdmin;
                  });
                  console.log("[sched] fallback branchAdmins from localUsers:", branchAdmins.map((a: any) => a.id));
                }
                // Compose admin body (single day)
                const assignedBranchName = (localBranches.find(b => String(b.id) === String(targetBranchId))?.name) || "";
                const fromBranchName = (localBranches.find(b => String(b.id) === String(employeeBranchId))?.name) || "";
                const adminBody = `Branch '${fromBranchName || "Unknown"}' has assigned ${employeeName} to work at your branch '${assignedBranchName}'.\n Date: ${dateReadable}${timePart ? `, Time: ${timePart}` : ""}`;
                // send per-admin notification (skip if admin is the employee)
                try {
                  const adminIds = Array.from(new Set((branchAdmins || []).map((a: any) => String(a.id))))
                    .filter(id =>
                      id &&
                      String(id) !== String(employeeIdToUse) &&
                      String(id) !== String(userId) // <-- exclude the sender
                    );
                  await Promise.all(adminIds.map((adminId: string) =>
                    sendNotificationToUser(adminId, {
                      title: "Staff Assigned to Your Branch",
                      body: adminBody,
                      type: "branch_staff_assigned",
                      meta: {
                        fromBranchId: employeeBranchId,
                        toBranchId: targetBranchId,
                        employeeId: employeeIdToUse,
                        date,
                        start_time: start,
                        end_time: end,
                      },
                    })
                  ));
                  console.log("[sched] notified branch admins individually for branch", targetBranchId, "date", date, adminIds);
                } catch (e) {
                  console.warn("[sched] notify branch admins individually failed for branch", targetBranchId, e);
                }
                // ALSO write a branch-level notification doc for this single date (so branch listeners get it)
                try {
                  const adminBranchDoc = {
                    title: "Staff Assigned to Your Branch",
                    body: adminBody,
                    type: "branch_staff_assigned",
                    meta: {
                      fromBranchId: employeeBranchId ?? null,
                      fromUserId: userId ?? null,
                      fromUserName: employeeName ?? null,
                      toBranchId: targetBranchId ?? null,
                      toBranchName: assignedBranchName ?? null, // <-- add this
                      assignedBranchName: assignedBranchName ?? null, // keep this (backwards compatibility)
                      employeeId: employeeIdToUse,
                      date,
                      start_time: start,
                      end_time: end,
                    },
                    read: false,
                    createdAt: serverTimestamp(),
                  };
                  await addDoc(collection(db, "notifications_branch", String(targetBranchId), "inbox"), adminBranchDoc);
                  console.log("[sched] wrote branch-level notification (single-day) for branch", targetBranchId, "date", date);
                } catch (e) {
                  console.warn("[sched] write branch-level notification failed for branch", targetBranchId, e);
                }
              } else {
                // if targetBranchId equals employeeBranchId or targetBranchId missing -> do not notify branch admins
                console.log("[sched] skipping admin notification for date", s.date, "because targetBranch equals employeeBranch or missing");
              }
            } catch (e) {
              console.warn("[sched] notify loop error for schedule row", s, e);
            }
          } // end for schedulesToSave loop
          // success UI
          showSuccessToast(lang.schedule_added || "Schedules created");
          navigation.navigate("Footer_A", {
            selectedTab: "WorkSchedule",
            userId,
            langId,
            toastMessage: "Schedules created successfully",
          });
        } catch (err: any) {
          console.error("Failed to postSchedulesBulk / notify", err);
          showErrorToast(lang.failed_to_save || "Failed to save schedules");
        } finally {
          setLoading(false);
        }
      }}
      backgroundColor={colors.primary}
      width={"48%"}
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
      {/* ---------- END POPUP ---------- */}
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
  modalOverlay: { flex: 1, justifyContent: "flex-end", },
  modalOverlayAbsolute: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, },
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
    height: "80%",
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