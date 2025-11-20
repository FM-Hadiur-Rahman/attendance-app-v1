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
import { getEmployeeSchedules, getSchedules, ScheduleItem, postSchedulesBulk, updateSchedule, createSchedule, deleteSchedule } from "../../../../api/schedules";

import Header from "../../../../components/Header";
import colors from "../../../../styles/Colors";
import CartBox from "../../../../components/CartBox";
import { Button1 } from "../../../../components/Button";
import fonts from "../../../../styles/Fonts";
import InputBox from "../../../../components/InputBox";
import translations from "../../../../assets/translations.json";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../../components/Toast";
import Popup from "../../../../components/Popup";


type Branch = {
  _id?: string;
  id?: string;
  name?: string;
};


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

export default function EditScheduleScreen(props: any) {
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
    const [changeLog, setChangeLog] = useState<Array<{ type: "add" | "update" | "delete"; schedule: any }>>([]);
    const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const [weekOffset, setWeekOffset] = useState<number>(0);

    const normalizeUsers = (users: ProfileUser[] = []): LocalUser[] => {
        return users.map((u) => {
            const id = (u as any)._id ?? (u as any).id ?? "";
            const fullname = (u as any).fullname ?? (u as any).fullName ?? (u as any).name ?? (u as any).username ?? id;
                   let branch_id = "";
        if (typeof u.branch === "string") {
            branch_id = u.branch;
        } else if (u.branch) {
            branch_id = (u.branch ?? (u.branch as any).id) ?? ""; // safe fallback for API that might include id
        } else if (u._id) {
            branch_id = u._id;
        }
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
                const profBranch = typeof profile.branch === 'string' ? profile.branch : profile.branch ?? undefined;
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

    const formatTime12 = (time: string) => {
        if (!time) return "";
        const [hh, mm] = time.split(":").map(Number);
        const period = hh >= 12 ? "PM" : "AM";
        const hour12 = hh % 12 || 12;
        return `${hour12}:${mm.toString().padStart(2, "0")} ${period}`;
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
    const onAddSchedule = async () => {
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
            setBranchFilterOpen(true);
            hasError = true;
        }
        if (!timeFrom || timeFrom.trim() === "") {
            setTimeFromError(lang.Required || "Required");
            showErrorToast(lang.Please_enter_start_time || "Enter start time");
            hasError = true;
        }

        const dur = parseFloat(durationHours || "0");

        if (hasError) return;

        const targetDate = selectedDayYmd || selectedDisplayYmd;
        if (!targetDate) {
            showErrorToast("No valid date selected for schedule (abort)");
            return;
        }

        const scheduleDate = String(targetDate).split("T")[0];
        const endTime = computeEndTime(timeFrom, dur);

        try {
            setLoading(true);

            let backendSchedule: any;

            if (modalEditingId) {
                // ✅ Update or delete existing schedule
                if (isNaN(dur) || dur <= 0) {
                    // ➖ Delete schedule if duration is 0 or invalid
                    await deleteSchedule(modalEditingId); // call your API
                    showSuccessToast("Schedule deleted because duration is 0");

                    // Remove from local state
                    setLocalSchedules((prev = []) => {
                        const filtered = prev.filter((s) => s._id !== modalEditingId);
                        const map: Record<string, any[]> = {};
                        const currentWeekYMD = displayWeekDates.map((d) => dateToYMD(d));
                        filtered.forEach((s) => {
                            if (!currentWeekYMD.includes(s.date)) return;
                            if (!map[s.date]) map[s.date] = [];
                            map[s.date].push(s);
                        });
                        setLocalSchedulesByDate(map);
                        return filtered;
                    });

                    setModalEditingId(null);
                    setAddScheduleModalVisible(false);
                    return;
                }

                // Otherwise update normally
                if (!selectedStaffId || !selectedBranchId) {
                    showErrorToast("Please select both staff and branch");
                    return;
                }

                const payload = {
                    employee_id: selectedStaffId,
                    branch_id: selectedBranchId,
                    start_time: timeFrom,
                    end_time: endTime,
                    duration: durationHours,
                    day_of_week: WEEKDAYS[new Date(scheduleDate).getDay()],
                };

                backendSchedule = await updateSchedule(modalEditingId, payload);
                showSuccessToast("Schedule updated successfully");

            } else {
                // ➕ Create new schedule
                if (isNaN(dur) || dur <= 0) {
                    showErrorToast("Cannot create schedule with duration 0");
                    return;
                }

                if (!selectedStaffId || !selectedBranchId) {
                    showErrorToast("Please select both staff and branch");
                    return;
                }

                const payload = {
                    employee_id: selectedStaffId,
                    branch_id: selectedBranchId,
                    date: scheduleDate,
                    start_time: timeFrom,
                    end_time: endTime,
                    duration: durationHours,
                    day_of_week: WEEKDAYS[new Date(scheduleDate).getDay()],
                };

                backendSchedule = await createSchedule(payload);
                showSuccessToast("Schedule created successfully");
                setModalEditingId(backendSchedule._id);
            }

            // Normalize backend date
            const normalizedSchedule = {
                ...backendSchedule,
                date: String(backendSchedule.date).split("T")[0],
            };

            // Update local schedules state
            setLocalSchedules((prev = []) => {
                const copy = [...prev];

                const idx = copy.findIndex(
                    (s) =>
                        s._id === normalizedSchedule._id ||
                        (s.employee_id === normalizedSchedule.employee_id && s.date === normalizedSchedule.date)
                );

                if (Number(normalizedSchedule.duration) <= 0) {
                    // 🗑️ Delete schedule if duration <= 0
                    if (idx !== -1) {
                        const deletedSchedule = copy[idx];
                        copy.splice(idx, 1);

                        // Add to changeLog as delete
                        setChangeLog((prev = []) => [
                            ...prev,
                            { type: "delete", schedule: deletedSchedule },
                        ]);
                    }
                } else {
                    // ➕ Normal add / update
                    if (idx !== -1) {
                        copy[idx] = normalizedSchedule;
                        setChangeLog((prev = []) => [
                            ...prev,
                            { type: "update", schedule: normalizedSchedule },
                        ]);
                    } else {
                        copy.push(normalizedSchedule);
                        setChangeLog((prev = []) => [
                            ...prev,
                            { type: "add", schedule: normalizedSchedule },
                        ]);
                    }
                }

                // 🔹 Only include schedules for current week
                const map: Record<string, any[]> = {};
                const currentWeekYMD = displayWeekDates.map((d) => dateToYMD(d));
                copy.forEach((s) => {
                    if (!currentWeekYMD.includes(s.date)) return;
                    if (!map[s.date]) map[s.date] = [];
                    map[s.date].push(s);
                });
                setLocalSchedulesByDate(map);

                return copy;
            });



            setAddScheduleModalVisible(false);
            await onRefresh();

        } catch (err) {
            console.error("onAddSchedule error:", err);
            showErrorToast("Failed to save schedule");
        } finally {
            setLoading(false);
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

        setSelectedDayYmd(dataYmd);        // template origin
        setSelectedDisplayYmd(uiYmd);      // date we want to actually create/edit
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
        // 1️⃣ Block if modal open
        if (addScheduleModalVisible) {
            showErrorToast("Please finish editing the schedule");
            return;
        }

        // 2️⃣ Check field errors
        if (staffError || timeFromError || durationError) {
            showErrorToast("Please fix errors before saving");
            return;
        }

        // 3️⃣ Check changeLog for add/update/delete
        const hasRealChanges =
            Array.isArray(changeLog) &&
            changeLog.some(
                (c) => c.type === "add" || c.type === "update" || c.type === "delete"
            );

        // 🔹 If there are no changes, allow navigation without popup
        if (!hasRealChanges) {
            showErrorToast(lang.no_changes_to_save || "No changes to save");
            return;
        }

        // 4️⃣ Otherwise show confirmation popup
        setSaveConfirmVisible(true);

        // 🔹 Optional: debug
        console.log("📝 changeLog before save:", changeLog);
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

    const computeDuration = (startTime: string, endTime: string) => {
        if (!startTime || !endTime) return 0;
        const [startH, startM] = startTime.split(":").map(Number);
        const [endH, endM] = endTime.split(":").map(Number);
        const start = startH * 60 + startM;
        const end = endH * 60 + endM;
        const diffMins = end - start;
        return diffMins > 0 ? diffMins / 60 : 0;
    };




    return (
        <View style={styles.container}>
            <Header
                backgroundColor={colors.secondary}
                position="relative"
                center={{ type: "text", value: lang.Edit_Schedule }}
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
                                // Only allow typing or selection if userId is NOT passed
                                if (!route.params?.userId) {
                                    setSelectedStaff(v);
                                    setStaffError("");
                                    setSelectedStaffId(null);
                                    setStaffFilterOpen(true);
                                    setTimeout(measureStaffInput, 20);
                                }
                            }}
                            editable={!route.params?.userId} // 🔒 disable if userId already given
                            onPress={undefined}
                            rightIcon={require("../../../../assets/icons/a_staffrecord_b.png")}
                            rightIconStyle={{ tintColor: colors.primary }}
                            onRightIconPress={() => {
                                // Only open filter if editing staff is allowed
                                if (!route.params?.userId) {
                                    if (!staffFilterOpen) {
                                        setSelectedStaff('');
                                        setSelectedStaffId(null);
                                        setStaffFilterOpen(true);
                                        setTimeout(measureStaffInput, 20);
                                    } else {
                                        setStaffFilterOpen(false);
                                        setStaffInputLayout(null);
                                    }
                                }
                            }}
                            errorMessage={staffError}
                        />

                    </View>
                    <View style={{ marginTop: 0 }}>
                        {Array.from({ length: 7 }).map((_, idx) => {
                            const displayD = displayWeekDates[idx]; // current-week date for showing number & weekday
                            const dataD = weekDates[idx];           // schedule lookup date (may be offset week)
                            const displayYmd = dateToYMD(displayD); // for UI/expired logic
                            const ymd = dateToYMD(dataD);           // for schedule lookup
                            const dateNum = displayD.getDate();
                            const wk = WEEKDAYS[displayD.getDay()];
                            const daySchedules = localSchedulesByDate[ymd] || []; // 查找 schedule by data-week ymd
                            const staffSchedule = selectedStaffId ? daySchedules.find((s) => s.user_id === selectedStaffId) : null;
                            const hasScheduleForStaff = !!staffSchedule;
                            const expired = isBeforeToday(displayYmd); // expired 判定 use display date
                            const displayTime = hasScheduleForStaff
                                ? `${formatTime12(staffSchedule.start_time)} – ${formatTime12(
                                    staffSchedule.end_time ||
                                    computeEndTime(staffSchedule.start_time, parseFloat(staffSchedule.duration || "0"))
                                )}`
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

                                            // If schedule already exists for this staff on this date → edit it
                                            if (hasScheduleForStaff && staffSchedule) {
                                                setModalEditingId(staffSchedule.id); // existing schedule ID
                                                setSelectedBranch(
                                                    localBranches.find((b) => b.id === staffSchedule.branch_id)?.name || ""
                                                );
                                                setSelectedBranchId(staffSchedule.branch_id);
                                                setTimeFrom(staffSchedule.start_time);
                                                setDurationHours(
                                                    staffSchedule.duration
                                                        ? staffSchedule.duration.toString()
                                                        : computeDuration(staffSchedule.start_time, staffSchedule.end_time).toString()
                                                );
                                                setAddScheduleModalVisible(true); // open modal
                                            } else {
                                                // otherwise new schedule
                                                openAddModalForDate(ymd, displayYmd);
                                            }
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
                <Button1 text={lang.Save_Changes} width={"100%"} onPress={onFooterSaveAndBack} />
            </View>
            <Modal animationType="slide" transparent visible={addScheduleModalVisible} onRequestClose={() => { setAddScheduleModalVisible(false);  }}>
                <Pressable style={styles.modalOverlay} onPress={() => { setAddScheduleModalVisible(true);}} pointerEvents="auto">

                    <View style={styles.modalContainer}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>{lang.Edit_Schedule} </Text>
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
                                    placeholder="HH:MM"
                                    value={timeFrom}
                                    setValue={(v: string) => {
                                        // Remove non-digits
                                        let digits = v.replace(/[^0-9]/g, "");

                                        let hh = "";
                                        let mm = "";

                                        if (digits.length > 0) {
                                            // Hours (max 2 digits)
                                            hh = digits.slice(0, 2);
                                            if (parseInt(hh) > 23) hh = "23"; // clamp to 24
                                        }

                                        if (digits.length > 2) {
                                            // Minutes (max 2 digits)
                                            mm = digits.slice(2, 4);
                                            if (parseInt(mm) > 59) mm = "59"; // clamp to 59
                                        }

                                        const formatted = hh + (mm ? ":" + mm : "");
                                        setTimeFrom(formatted);

                                        // Full validation
                                        const isValid = /^([0-1]?[0-9]|2[0-4]):([0-5][0-9])$/.test(formatted);
                                        if (isValid) setTimeFromError("");
                                        else setTimeFromError("Invalid time format (00 00)");
                                    }}
                                    keyboardType="numeric"          // regular keyboard
                                    maxLength={5}                   // HH:MM
                                    rightIcon={require("../../../../assets/icons/clock_b.png")}
                                    errorMessage={timeFromError}
                                    rightIconStyle={{ tintColor: colors.primary }}
                                    onRightIconPress={onShowNativeTimePicker} // clock icon opens native time picker
                                />

                                <InputBox
                                    label={lang.Duration}
                                    placeholder={"Eg: 8"}
                                    value={durationHours}
                                    setValue={(v: string) => { setDurationHours(v.replace(/[^0-9.]/g, "")); setDurationError(""); }}
                                    errorMessage={durationError}
                                    rightIconStyle={{ tintColor: colors.primary }}
                                    keyboardType="numeric"
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
                titleStyle={{ color: colors.primary, marginBottom: 30, fontSize: fonts.size.m, fontWeight: fonts.weight.regular}}
            >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                    <Button1
                        text={lang.yes || "Yes"}
                        onPress={async () => {
                            setSaveConfirmVisible(false);
                            setLoading(true);

                            try {
                                // 1️⃣ Gather user changes (add / update / delete)
                                const userChanges = (changeLog || [])
                                    .filter(c => c.type === "add" || c.type === "update" || c.type === "delete")
                                    .map(c => ({ ...JSON.parse(JSON.stringify(c.schedule)), _action: c.type }));

                                if (userChanges.length === 0) {
                                    showErrorToast(lang.no_changes_to_save || "No changes to save");
                                    return;
                                }

                                // 2️⃣ Consider only current week schedules
                                const currentWeekYMDs = displayWeekDates.map(d => dateToYMD(d));
                                const currentWeekSchedules = Object.entries(localSchedulesByDate)
                                    .filter(([ymd]) => currentWeekYMDs.includes(ymd))
                                    .flatMap(([, schedules]) => schedules)
                                    .map(s => ({ ...JSON.parse(JSON.stringify(s)) }));

                                // 3️⃣ Merge add/update changes
                                const scheduleMap = new Map<string, any>();
                                currentWeekSchedules.forEach(s => {
                                    const key = `${s.user_id}-${s.date}-${s.branch_id || ""}`;
                                    scheduleMap.set(key, s);
                                });

                                userChanges.forEach(s => {
                                    const key = `${s.user_id}-${s.date}-${s.branch_id || ""}`;
                                    if (s._action === "delete") {
                                        scheduleMap.delete(key); // 🔹 handle deletion properly
                                    } else {
                                        scheduleMap.set(key, s); // add/update
                                    }
                                });

                                // 4️⃣ Normalize
                                const normalize = (s: any) => {
                                    const startRaw = s.start_time ?? s.start ?? s.from_time ?? "";
                                    const computedEnd =
                                        s.end_time ?? s.end ?? (s.duration && startRaw ? computeEndTime(startRaw, Number(s.duration)) : "");
                                    const start = timeToHHMM(String(startRaw));
                                    const end = timeToHHMM(String(computedEnd));
                                    return {
                                        ...s,
                                        start_time: start,
                                        end_time: end,
                                        _dedupeKey: `${s.user_id}-${s.date}-${start}-${end}-${s.branch_id || ""}`,
                                    };
                                };

                                const normalizedList = Array.from(scheduleMap.values()).map(normalize);

                                // 5️⃣ Deduplicate
                                const seen = new Set<string>();
                                const deduped = normalizedList.filter(s => {
                                    if (seen.has(s._dedupeKey)) return false;
                                    seen.add(s._dedupeKey);
                                    return true;
                                });

                                const schedulesToSave = deduped.map(s => {
                                    const copy = { ...s };
                                    delete copy._dedupeKey;
                                    return copy;
                                });

                                // 6️⃣ Split add/update
                                const schedulesToUpdate = schedulesToSave.filter(s => s._id || s.id);
                                const schedulesToCreate = schedulesToSave.filter(s => !s._id && !s.id);

                                // 🔹 Call your backend logic here
                                // await Promise.all(schedulesToUpdate.map(s => updateSchedule(s._id || s.id, s)));
                                // if (schedulesToCreate.length) await createSchedulesBulk(schedulesToCreate);

                                showSuccessToast(lang.schedule_updated || "Schedule updated successfully");

                                // 7️⃣ Always navigate (even for deletes)
                                navigation.navigate("Footer_A", {
                                    selectedTab: "WorkSchedule",
                                    userId,
                                    langId,
                                    toastMessage: "Schedules saved successfully",
                                });

                            } catch (err) {
                                console.error("❌ Failed to save schedules:", err);
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
        </View>
    );
}
/* Styles */
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.secondary },
    scrollContainer: { paddingBottom: 0 },
    scrollBody: { backgroundColor: colors.secondary, paddingTop: 20, paddingHorizontal: 20, paddingBottom: "25%" },
    group1: { marginBottom: 20 },
    groupTitle: { color: colors.text, fontWeight: fonts.weight.regular, fontSize: fonts.size.m },
    groupSubtitle: { color: colors.search, fontWeight: fonts.weight.regular, fontSize: fonts.size.s, marginTop: 6 },

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
    modalTitle: { fontSize: fonts.size.l, fontWeight: fonts.weight.medium, textAlign: "center", marginBottom: 8 },

    footerButtonWrap: { position: "absolute", left: 20, right: 20, bottom: 0, paddingTop: 10, paddingBottom: 30, backgroundColor: colors.secondary },
    each_day: { flexDirection: "row", width: '100%', marginBottom: 20, alignItems: "center", },
    day: { borderColor: colors.primary, borderWidth: 1, borderRadius: 12, backgroundColor: colors.secondary, marginRight: 10, paddingTop: 11, paddingBottom: 11, width: 52, alignItems: "center" },
    day_text: { color: colors.primary, fontSize: fonts.size.s, fontWeight: fonts.weight.regular },
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
        fontWeight: fonts.weight.regular,
        color: colors.primary,

    },
    time_text: {
        fontSize: fonts.size.s,
        fontWeight: fonts.weight.regular,
        color: colors.primary,
    },
    clock: { width: 14, height: 14, marginRight: 4 },
});
