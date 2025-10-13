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
import { users as importedUsers, User } from "../../../../api/Users";
import { schedules as importedSchedules } from "../../../../api/Schedule";
import { branches as importedBranches } from "../../../../api/Branch";
import Header from "../../../../components/Header";
import colors from "../../../../styles/Colors";
import CartBox from "../../../../components/CartBox";
import { Button1 } from "../../../../components/Button";
import fonts from "../../../../styles/Fonts";
import InputBox from "../../../../components/InputBox";
import translations from "../../../../assets/translations.json";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../../components/Toast";
import Popup from "../../../../components/Popup";

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

  // confirm save popup visibility
  const [saveConfirmVisible, setSaveConfirmVisible] = useState<boolean>(false);


  useEffect(() => {
    console.log("AddScheduleScreen opened", { userId, langId, editingId, routeParams: route.params });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editingId: string | undefined = route.params?.id;

  // quick helper: true when the screen was opened to edit an existing schedule
  const isEditingScreen = () => Boolean(editingId);

  const [refreshing, setRefreshing] = useState(false);

  // Local copies of API arrays so refresh can re-sync when the api files change
  const [localUsers, setLocalUsers] = useState<Array<User>>(() => [...importedUsers]);
  const [localBranches, setLocalBranches] = useState<Array<any>>(() => [...importedBranches]);
  const [localSchedules, setLocalSchedules] = useState<Array<any>>(() => [...importedSchedules]);

  // Derived map: schedules grouped by date (Y-M-D)
  const [localSchedulesByDate, setLocalSchedulesByDate] = useState<Record<string, any[]>>(() => {
    const map: Record<string, any[]> = {};
    for (const s of importedSchedules) {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    }
    return map;
  });

  // Modal-level editing id: this prevents accidentally updating a different schedule
  const [modalEditingId, setModalEditingId] = useState<string | null>(null);

  // Staff selection (typeable)
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffError, setStaffError] = useState<string>("");
  const [staffFilterOpen, setStaffFilterOpen] = useState<boolean>(false);

  // Branch selection (typeable)
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [branchFilterOpen, setBranchFilterOpen] = useState(false);

  // wrappers & layouts for overlays
  const staffInputWrapperRef = useRef<View | null>(null);
  const [staffInputLayout, setStaffInputLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // branch input layout relative to modal container (we capture via onLayout)
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
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

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

  // prefill if navigation passed a user id (admin opened for a specific user)
  useEffect(() => {
    if (!userId) return;
    const prefillUser = localUsers.find((u) => u.id === userId) || null;
    if (prefillUser && prefillUser.role === "employee") {
      setSelectedStaff(prefillUser.fullname);
      setSelectedStaffId(prefillUser.id);
      const br = localBranches.find((b) => b.id === prefillUser.branch_id);
      if (br) {
        setSelectedBranch(br.name);
        setSelectedBranchId(br.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, localUsers, localBranches]);

  const getWeekDates = () => {
    const today = new Date();
    const dayIdx = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayIdx);
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
  const weekDates = getWeekDates();

  // Whenever localSchedules changes, rebuild the grouped-by-date map
  useEffect(() => {
    const map: Record<string, any[]> = {};
    for (const s of localSchedules) {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    }
    setLocalSchedulesByDate(map);
  }, [localSchedules]);

  const onRefresh = async () => {
    setRefreshing(true);
    // small delay for UX
    await new Promise((r) => setTimeout(r, 600));
    try {
      // re-sync with the imported arrays (someone mutated them externally)
      setLocalUsers([...importedUsers]);
      setLocalBranches([...importedBranches]);
      setLocalSchedules([...importedSchedules]);
      // showSuccessToast("Refreshed");
    } catch (e) {
      console.warn("refresh failed", e);
      showErrorToast("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  // staff suggestions filtered by the branch_id passed from previous screen.
  // If no branch_id is passed, default to "B001".
  const screenBranchId: string = (route.params?.branch_id as string) ?? "B001";

  const employeeList = localUsers.filter(
    (u) => u.role === "employee" && (u.branch_id ?? "") === screenBranchId
  );
  const branchList = localBranches;

  const staffSuggestions = employeeList.filter((u) => {
    const q = (selectedStaff || "").toLowerCase();
    if (!q) return true;
    return (
      u.fullname.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q) ||
      (u.branch_id || "").toLowerCase().includes(q)
    );
  });

  const branchSuggestions = branchList.filter((b) =>
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

  const computeEndTime = (startHHMMSS: string, durationHrs: number) => {
    const parts = startHHMMSS.split(":").map((p) => parseInt(p, 10) || 0);
    const dt = new Date();
    dt.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
    dt.setTime(dt.getTime() + Math.round(durationHrs * 3600 * 1000));
    const hh = pad2(dt.getHours());
    const mm = pad2(dt.getMinutes());
    const ss = pad2(dt.getSeconds());
    return `${hh}:${mm}:${ss}`;
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

    // Use modalEditingId (not screen-level editingId) to decide update vs create
    if (modalEditingId) payload.id = modalEditingId;

    if (typeof route.params?.onSave === "function") {
      try {
        route.params.onSave(payload);
        showSuccessToast(modalEditingId ? lang.schedule_updated || "Schedule updated" : lang.schedule_added || "Schedule added");
      } catch (e) {
        console.warn("onSave callback threw:", e);
      }
      // update localSchedules to reflect change as well
      setLocalSchedules((prev) => {
        const copy = prev.map((p) => ({ ...p }));
        if (payload.id) {
          const idx = copy.findIndex((s) => s.id === payload.id);
          if (idx !== -1) {
            copy[idx] = { ...copy[idx], ...payload, updateDate: new Date().toISOString() };
            setChangeLog((c) => [...c, { type: "update", schedule: copy[idx] }]);
          } else {
            const newSch = { id: `S${(copy.length + 1).toString().padStart(3, "0")}`, ...payload, createDate: new Date().toISOString(), updateDate: new Date().toISOString() };
            copy.push(newSch);
            setChangeLog((c) => [...c, { type: "add", schedule: newSch }]);
          }
        } else {
          const newSch = { id: `S${(copy.length + 1).toString().padStart(3, "0")}`, ...payload, createDate: new Date().toISOString(), updateDate: new Date().toISOString() };
          copy.push(newSch);
          setChangeLog((c) => [...c, { type: "add", schedule: newSch }]);
        }
        return copy;
      });

      // Close modal and clear modal editing state
      setAddScheduleModalVisible(false);
      setModalEditingId(null);
      return;
    }

    // If no onSave callback, we persist to importedSchedules (as original code did) and update localSchedules
    if (!modalEditingId) {
      const id = `S${(importedSchedules.length + 1).toString().padStart(3, "0")}`;
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

      // update importedSchedules (the 'api' file)
      importedSchedules.push(newSch);
      // update local
      setLocalSchedules((prev) => [...prev, newSch]);
      setChangeLog((c) => [...c, { type: "add", schedule: newSch }]);
      showSuccessToast("Schedule added");
    } else {
      const idx = importedSchedules.findIndex((sch) => sch.id === modalEditingId);
      if (idx !== -1) {
        importedSchedules[idx] = {
          ...importedSchedules[idx],
          user_id: payload.user_id,
          start_time: payload.start_time,
          duration: payload.duration,
          date: payload.date,
          branch_id: payload.branch_id,
          updateDate: new Date().toISOString(),
        };
        // update localSchedules
        setLocalSchedules((prev) => {
          const copy = prev.map((s) => (s.id === modalEditingId ? { ...importedSchedules[idx] } : s));
          return copy;
        });
        setChangeLog((c) => [...c, { type: "update", schedule: importedSchedules[idx] }]);
        showSuccessToast("Schedule updated");
      }
    }

    setAddScheduleModalVisible(false);
    setModalEditingId(null);
  };

  // === measurement helpers ===
  const measureStaffInput = () => {
    const handle = findNodeHandle(staffInputWrapperRef.current);
    if (!handle) return;
    UIManager.measure(handle, (x, y, width, height, pageX, pageY) => {
      setStaffInputLayout({ x: pageX, y: pageY, width, height });
    });
  };

  // branch input uses onLayout (relative to modal container)
  const onBranchLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    setBranchInputLayout({ x, y, width, height });
  };

  useEffect(() => {
    if (staffFilterOpen) {
      setTimeout(measureStaffInput, 40);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilterOpen, selectedBranch, addScheduleModalVisible]);

  // When clicking a date's time cartbox -> open modal for that date
  const openAddModalForDate = (ymd: string) => {
    if (isBeforeToday(ymd)) return;
    if (!selectedStaffId) {
      setStaffError(lang.Select_staff || "Please select staff first");
      showErrorToast(lang.Please_select_staff || "Select staff first");
      // open inline staff suggestions (non-modal)
      setStaffFilterOpen(true);
      setTimeout(measureStaffInput, 40);
      return;
    }

    // Check if a schedule exists for this staff on this date and prefill modal if found
    const daySchedules = localSchedulesByDate[ymd] || [];
    const staffSchedule = daySchedules.find((s) => s.user_id === selectedStaffId) || null;

    setSelectedDayYmd(ymd);
    setDurationError("");
    setTimeFromError("");

    if (staffSchedule) {
      // Prefill modal with schedule's values
      setTimeFrom(staffSchedule.start_time || "");
      setDurationHours(String(staffSchedule.duration ?? ""));
      // find branch name
      const br = localBranches.find((b) => b.id === staffSchedule.branch_id);
      if (br) {
        setSelectedBranch(br.name);
        setSelectedBranchId(br.id);
      } else {
        setSelectedBranch("");
        setSelectedBranchId(null);
      }
      // We're editing this existing schedule in the modal
      setModalEditingId(staffSchedule.id || null);
    } else {
      // empty modal defaults
      setTimeFrom("");
      setDurationHours("");
      setModalEditingId(null); // ensure we're in 'add' mode, not 'edit'
      // keep branch as chosen staff's branch if present; otherwise keep previous selection
      const staffObj = localUsers.find((u) => u.id === selectedStaffId) || null;
      if (staffObj) {
        const defaultBr = localBranches.find((b) => b.id === staffObj.branch_id);
        if (defaultBr) {
          setSelectedBranch(defaultBr.name);
          setSelectedBranchId(defaultBr.id);
        } else {
          // keep whatever branch selection is already present
        }
      }
    }

    setAddScheduleModalVisible(true);
  };

  useEffect(() => {
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
    // Because the screen was opened in edit-mode, set modal editing id as well
    setModalEditingId(editingId || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, localSchedules, localUsers, localBranches]);

  const handleStaffPick = (u: User) => {
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
  };

  const onFooterSaveAndBack = () => {
    // don't open popup if nothing changed
    if (changeLog.length === 0) {
      showErrorToast(lang.no_changes_to_save);
      return;
    }

    // don't open popup if modal is open (user might have unfinished input)
    if (addScheduleModalVisible) {
      showErrorToast("Please finish editing the schedule");
      return;
    }

    // don't open popup if there are validation errors visible
    if (staffError || timeFromError || durationError) {
      showErrorToast("Please fix errors before saving");
      return;
    }

    // Additional safety: ensure at least one meaningful change exists (redundant, but harmless)
    if (!Array.isArray(changeLog) || changeLog.length === 0) {
      showErrorToast("No changes to save");
      return;
    }

    // All checks passed — show confirmation popup
    setSaveConfirmVisible(true);
  };

  // screen dims for overlay limits
  const screenH = Dimensions.get("window").height;
  const screenW = Dimensions.get("window").width;

  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: editingId ? (lang.Edit_Schedule) : (lang.Add_Schedule), color: colors.text }}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.scrollBody}>
          <View style={styles.group1}>
            <Text style={styles.groupTitle}>{lang.Schedule_details}</Text>
            <Text style={styles.groupSubtitle}>{lang.Create_new_work_schedule}</Text>
          </View>

          {/* Staff - typeable, overlay suggestions */}
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
              // setValue={(v: string) => {
              //   setSelectedStaff(v);
              //   setStaffError("");
              //   setSelectedStaffId(null);
              //   setStaffFilterOpen(true);
              //   setTimeout(measureStaffInput, 20);
              // }}
              setValue={isEditingScreen() ? (_v: string) => { } : (v: string) => {
                setSelectedStaff(v);
                setStaffError("");
                setSelectedStaffId(null);
                setStaffFilterOpen(true);
                setTimeout(measureStaffInput, 20);
              }}
              editable={!isEditingScreen()}
              onPress={undefined}
              rightIcon={require("../../../../assets/icons/a_staffrecord_b.png")}
              rightIconStyle={{ tintColor: colors.primary }}
              // onRightIconPress={() => {
              //   if (!staffFilterOpen) {
              //     setStaffFilterOpen(true);
              //     setTimeout(measureStaffInput, 20);
              //   } else {
              //     setStaffFilterOpen(false);
              //     setStaffInputLayout(null);
              //   }
              // }}
              onRightIconPress={() => {
                // don't allow toggling suggestions when in edit-mode
                if (isEditingScreen()) return;
                if (!staffFilterOpen) {
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

          {/* Week row */}
          <View style={{ marginTop: 0 }}>
            {weekDates.map((d) => {
              const ymd = dateToYMD(d);
              const dateNum = d.getDate();
              const wk = WEEKDAYS[d.getDay()];
              const daySchedules = localSchedulesByDate[ymd] || [];
              const staffSchedule = selectedStaffId ? daySchedules.find((s) => s.user_id === selectedStaffId) : null;
              const hasScheduleForStaff = !!staffSchedule;
              const expired = isBeforeToday(ymd);
              const displayTime = hasScheduleForStaff ? `${formatTime12(staffSchedule.start_time)} – ${formatTime12(computeEndTime(staffSchedule.start_time, staffSchedule.duration))}` : null;
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
        <Button1 text={editingId ? (lang.Save_Changes) : (lang.Add_Schedule)} width={"100%"} onPress={onFooterSaveAndBack} />
      </View>

      {/* Add Schedule Modal */}
      <Modal animationType="slide" transparent visible={addScheduleModalVisible} onRequestClose={() => { setAddScheduleModalVisible(false); setModalEditingId(null); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { setAddScheduleModalVisible(false); setModalEditingId(null); }}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{modalEditingId ? lang.Edit_Schedule : lang.Add_Schedule}</Text>

            {/* We render branch overlay inside modal container (so it sits above modal content) */}
            <View>
              <ScrollView style={{ marginTop: 8, maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                {/* Branch input wrapper (measured for overlay) */}
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

                {/* Start time */}
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

                {/* Duration */}
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

              {/* Branch suggestion overlay inside modal container */}
              {branchFilterOpen && branchInputLayout && (
                // container positioned relative to modalContainer (onLayout gave coords relative to modal container)
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

      {/* Native Time Picker */}
      {showTimePicker && (
        <DateTimePicker
          value={timeStringToDate(timeFrom)}
          mode="time"
          is24Hour={true}
          display={Platform.OS === "ios" ? "spinner" : "clock"}
          onChange={onNativeTimeChange}
        />
      )}

      {/* Staff suggestion overlay rendered at root (no Modal) so keyboard doesn't hide on Android */}
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

      {/* Save confirmation popup */}
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
              // navigate back and pass changes (same behaviour as before)
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
