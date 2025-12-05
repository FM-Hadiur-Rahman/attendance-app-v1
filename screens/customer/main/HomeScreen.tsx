import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity, // ✅ Added missing import
  TextInput // ✅ Added missing import
} from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications"; // ✅ Added missing import
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import { Button1 } from "../../../components/Button";
import Popup from "../../../components/Popup";
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json";
import Toast, {
  showErrorToast,
  showSuccessToast,
  toastConfig,
} from "../../../components/Toast";
import CartBox from "../../../components/CartBox";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import moment from "moment";
import { getProfile, ProfileUser } from "../../../api/profile";
import {
  startAttendance,
  endAttendance,
  getBranchDetails,
  getMyAttendanceHistory,
  getMyAttendanceHistoryEnhanced,
  isCheckedInToday,
  hasCompletedShiftToday,
  hasOngoingCrossDayShift,
  getLastSchedule,
  getLastAttendanceRecord,
  scheduleEndShiftAlarm,
  cancelScheduledAlarm,
  scheduleCheckoutReminders,
  cancelAllScheduledCheckoutReminders,
  clearScheduleCache,
  getTodayScheduleNoCache,
  // ✅ Import new alarm functions
  scheduleCustomAlarm,
  getScheduledNotifications,
  cancelNotification
} from "../../../api/checkin_checkout";
//import { getTodaySchedule } from "../../../api/schedules";

// ✅ Define your navigation stack param list
export type RootStackParamList = {
  Home: { userId: string; langId: string };
  C_NotificationScreen: { userId: string; langId: string };
  // Add other screens with params here
};

// ✅ Typed navigation prop for this screen
type HomeScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "Home"
>;

// Props for your component
interface HomeScreenProps {
  userId: string;
  langId: string;
  setLangId: (lang: string) => void;
}

type CoordinatesArray = [number, number] | number[];

interface BranchRaw {
  location?: { coordinates?: CoordinatesArray } | null;
  address?: { coordinates?: CoordinatesArray } | string | null;
  coordinates?: CoordinatesArray;
  [key: string]: unknown;
}

interface BranchPayload {
  id?: string;
  _id?: string;
  name?: string;
  address?: string | { coordinates?: CoordinatesArray } | null;
  location?: { coordinates?: CoordinatesArray } | null;
  coordinates?: CoordinatesArray;
  raw?: BranchRaw | null;
  [key: string]: unknown;
}

interface BranchInfo {
  name?: string;
  address?: string;
  coordinates?: { latitude: number; longitude: number } | null;
  raw?: BranchPayload;
}

interface ScheduleApiPayload {
  start_time?: string;
  end_time?: string;
  date?: string;
  branch_id?: BranchPayload | string | null;
  [key: string]: unknown;
}

interface ScheduleBranch {
  name: string | null;
  address: string;
  rawBranch: BranchPayload | string | null;
}

interface TodaySchedule {
  start_time: string;
  end_time: string;
  duration: number;
  date: string;
  branch: ScheduleBranch | null;
  raw: ScheduleApiPayload;
}

type AttendanceEntry = {
  In?: string | null;
  Out?: string | null;
  [key: string]: unknown;
};

type ApiError = {
  response?: {
    status?: number;
    data?: { message?: string };
  };
};

// ✅ Main Component
const C_Homescreen: React.FC<HomeScreenProps> = ({
  userId,
  langId,
  setLangId,
}) => {
  // useNavigation with proper typing
  const navigation = useNavigation<HomeScreenNavigationProp>();
  
  // ✅ Add notification permission setup effect
  useEffect(() => {
    (async () => {
      // Request notification permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        console.warn("[home-screen] notifications permission denied");
      }

      // Ensure notifications show / play sound while app is foreground
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    })();
  }, []);
  const [withinRange, setWithinRange] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCheckoutPopup, setShowCheckoutPopup] = useState(false);
  const [showCheckInLoading, setShowCheckInLoading] = useState(false); // ✅ New state for check-in loading
  const [showCheckOutLoading, setShowCheckOutLoading] = useState(false); // ✅ New state for check-out loading
  const [showCheckInSuccessLoading, setShowCheckInSuccessLoading] = useState(false); // ✅ New state for post check-in success loading
  const [checkoutReminderIds, setCheckoutReminderIds] = useState<{ initialNotificationId: string | null, recurringNotificationId: string | null } | null>(null); // ✅ State to store notification IDs
  const currentLang = langId || "en";
  const lang =
    translations[currentLang as keyof typeof translations] ||
    translations["en"];
  const [currentUser, setCurrentUser] = useState<ProfileUser | null>(null);
  // branchInfo will always contain a displayable string in `.address`
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  // derive shop coords from branchInfo
  const SHOP_LAT = branchInfo?.coordinates?.latitude ?? 0;
  const SHOP_LON = branchInfo?.coordinates?.longitude ?? 0;
  const todayDate = new Date().toISOString().split("T")[0];
  const [loading, setLoading] = useState(true);
  const [todaySchedule, setTodaySchedule] = useState<TodaySchedule | null>(null);
  const [lastSchedule, setLastSchedule] = useState<ScheduleApiPayload | null>(null);
  const hasSchedule = !!todaySchedule && !!todaySchedule.start_time;
  const [attendanceToday, setAttendanceToday] = useState<AttendanceEntry | null>(null);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [duration, setDuration] = useState<string>("0h 0m");
  const [checkedIn, setCheckedIn] = useState<boolean>(false);
  const [checkedOut, setCheckedOut] = useState<boolean>(false);
  const [canCheckOut, setCanCheckOut] = useState<boolean>(false);
  const offDuty = !checkedIn || checkedOut;
  const CHECKIN_RADIUS = 150; // keep radius same (meters)
  // ✅ New state for check-in time eligibility
  const [canCheckIn, setCanCheckIn] = useState(false);
  // Simplified state for attendance status
  const [attendanceStatus, setAttendanceStatus] = useState<'not_checked_in' | 'checked_in' | 'shift_completed'>('not_checked_in');
  // ✅ Add ref for location caching
  const lastLocationCache = useRef<{location: Location.LocationObject; timestamp: number} | null>(null);

  // ✅ Add new state variables for custom alarms
  const [showAlarmSection, setShowAlarmSection] = useState(false);
  const [alarmTime, setAlarmTime] = useState("");
  const [alarmTitle, setAlarmTitle] = useState("Custom Alarm");
  const [alarmMessage, setAlarmMessage] = useState("This is your custom alarm");
  const [scheduledAlarms, setScheduledAlarms] = useState<Notifications.NotificationRequest[]>([]);

  const tryReverseGeocode = async (lat: number, lon: number) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return `Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}`;
      }
      const places = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lon,
      });
      if (places && places.length > 0) {
        const p = places[0];
        const parts = [
          p.name,
          p.street,
          p.city,
          p.region,
          p.postalCode,
          p.country,
        ].filter(Boolean);
        return parts.join(", ");
      }
      return null;
    } catch (err) {
      console.warn("❌ reverseGeocode failed:", err);
      return null;
    }
  };

  const extractLatLon = (
    branchRawOrObj: BranchPayload | BranchRaw | null
  ): { lat?: number; lon?: number } | null => {
    if (!branchRawOrObj || typeof branchRawOrObj !== "object") return null;
    const hasCoordinateAddress = (
      addr: unknown
    ): addr is { coordinates?: CoordinatesArray } =>
      !!addr && typeof addr === "object" && "coordinates" in (addr as object);

    const branchPayload = branchRawOrObj as BranchPayload;
    const addressCoords =
      hasCoordinateAddress(branchPayload.address)
        ? branchPayload.address.coordinates
        : undefined;
    const candidates: Array<CoordinatesArray | undefined> = [
      branchPayload.location?.coordinates,
      addressCoords,
      branchPayload.coordinates,
    ];

    if ("raw" in branchRawOrObj && branchPayload.raw) {
      candidates.push(
        branchPayload.raw.location?.coordinates,
        hasCoordinateAddress(branchPayload.raw.address)
          ? branchPayload.raw.address.coordinates
          : undefined
      );
    }
    for (const c of candidates) {
      if (
        Array.isArray(c) &&
        c.length >= 2 &&
        typeof c[0] === "number" &&
        typeof c[1] === "number"
      ) {
        const a = c[0],
          b = c[1];
        if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
          const latIfA = a,
            lonIfA = b;
          const latIfB = b,
            lonIfB = a;
          if (
            Math.abs(latIfA) <= 90 &&
            Math.abs(lonIfA) <= 180 &&
            Math.abs(latIfB) <= 90 &&
            Math.abs(lonIfB) <= 180
          ) {
            // assume GeoJSON [lon,lat]
            return { lat: b, lon: a };
          }
        }
        return { lat: c[1], lon: c[0] };
      }
    }
    return null;
  };

  const getBranchReferenceId = (
    branchRef: BranchPayload | string | null | undefined
  ): string | null => {
    if (branchRef && typeof branchRef === "object") {
      return branchRef._id ?? branchRef.id ?? null;
    }
    return null;
  };

  useEffect(() => {
    let mounted = true;
    const fetchAndResolve = async () => {
      const branchId =
        getBranchReferenceId(todaySchedule?.raw.branch_id) ??
        getBranchReferenceId(todaySchedule?.branch?.rawBranch) ??
        null;
      if (!branchId) return;
      try {
        const branchDetails = await getBranchDetails(branchId);
        if (!branchDetails) return;
        const branch = branchDetails as BranchPayload;
        const coords =
          extractLatLon(branch) ?? extractLatLon(branch.raw ?? null) ?? null;
        let resolvedAddress: string | null = null;
        let finalLat: number | undefined;
        let finalLon: number | undefined;
        if (
          typeof branch.address === "string" &&
          branch.address.trim().length > 0
        ) {
          resolvedAddress = branch.address;
        }
        if (coords) {
          finalLat = coords.lat;
          finalLon = coords.lon;
          // ✅ Only call if finalLat and finalLon are numbers
          if (typeof finalLat === "number" && typeof finalLon === "number") {
            const firstTry = await tryReverseGeocode(finalLat, finalLon);
            if (firstTry) {
              resolvedAddress = firstTry;
            } else {
              const swappedTry = await tryReverseGeocode(finalLon, finalLat);
              if (swappedTry) {
                resolvedAddress = swappedTry;
                const tmp = finalLat;
                finalLat = finalLon;
                finalLon = tmp;
              }
            }
          }
          
          // ✅ Log branch coordinates
          console.log("🏢 Branch Coordinates:", {
            name: branch.name,
            latitude: finalLat,
            longitude: finalLon
          });
        }
        if (
          !resolvedAddress &&
          typeof finalLat === "number" &&
          typeof finalLon === "number"
        ) {
          resolvedAddress = `Lat: ${finalLat.toFixed(6)}, Lon: ${finalLon.toFixed(6)}`;
        }
        if (!resolvedAddress) {
          resolvedAddress = branch.name ?? "Address not available";
        }
        if (mounted) {
          setBranchInfo({
            name: branch.name ?? branch.id ?? "Branch",
            address: resolvedAddress ?? undefined,
            coordinates:
              typeof finalLat === "number" && typeof finalLon === "number"
                ? { latitude: finalLat, longitude: finalLon }
                : null,
            raw: (branch.raw ?? branch) as BranchPayload,
          });
        }
      } catch (err) {
        console.error("❌ Error resolving branch address:", err);
        if (mounted) {
          setBranchInfo((prev: BranchInfo | null) => ({
            ...(prev || {}),
            name: prev?.name ?? todaySchedule?.branch?.name ?? "Branch",
            address: prev?.address ?? "Address not available",
          }));
        }
      }
    };
    void fetchAndResolve();
    return () => {
      mounted = false;
    };
  }, [todaySchedule]);

  // ✅ Updated: Compute canCheckIn on schedule change
  useEffect(() => {
    if (!todaySchedule) {
      setCanCheckIn(false);
      return;
    }
    const tzDate =
      todaySchedule.date?.split("T")[0] ??
      new Date().toISOString().split("T")[0];
    const scheduleDateTime = new Date(
      `${tzDate}T${todaySchedule.start_time}:00`
    );
    const earliestCheckInTime = new Date(
      scheduleDateTime.getTime() - 15 * 60 * 1000
    );
    const now = new Date();
    
    // ✅ Check if current time is past the scheduled end time
    let scheduleEndDate = new Date(
      `${tzDate}T${todaySchedule.end_time}:00`
    );
    
    // Handle case where end time is next day (e.g., start 23:00, end 06:00)
    const scheduleStartDate = new Date(
      `${tzDate}T${todaySchedule.start_time}:00`
    );
    if (scheduleEndDate < scheduleStartDate) {
      scheduleEndDate.setDate(scheduleEndDate.getDate() + 1);
    }
    
    // ✅ Disable check-in if current time is past the scheduled end time
    if (now > scheduleEndDate) {
      setCanCheckIn(false);
      return;
    }
    
    setCanCheckIn(now >= earliestCheckInTime);
  }, [todaySchedule]);
  // ✅ New: Live update canCheckIn every minute for button state
  useEffect(() => {
    if (!todaySchedule) return;
    const interval = setInterval(() => {
      const tzDate =
        todaySchedule.date?.split("T")[0] ??
        new Date().toISOString().split("T")[0];
      const scheduleDateTime = new Date(
        `${tzDate}T${todaySchedule.start_time}:00`
      );
      const earliestCheckInTime = new Date(
        scheduleDateTime.getTime() - 15 * 60 * 1000
      );
      const now = new Date();
      
      // ✅ Check if current time is past the scheduled end time
      let scheduleEndDate = new Date(
        `${tzDate}T${todaySchedule.end_time}:00`
      );
      
      // Handle case where end time is next day (e.g., start 23:00, end 06:00)
      const scheduleStartDate = new Date(
        `${tzDate}T${todaySchedule.start_time}:00`
      );
      if (scheduleEndDate < scheduleStartDate) {
        scheduleEndDate.setDate(scheduleEndDate.getDate() + 1);
      }
      
      // ✅ Disable check-in if current time is past the scheduled end time
      if (now > scheduleEndDate) {
        setCanCheckIn(false);
        return;
      }
      
      setCanCheckIn(now >= earliestCheckInTime);
    }, 60000); // every 1 minute
    return () => { clearInterval(interval); };
  }, [todaySchedule]);  const handleCheckInAttempt = () => {
    if (!todaySchedule) return false;
    
    const tzDate =
      todaySchedule.date?.split("T")[0] ??
      new Date().toISOString().split("T")[0];
    
    const scheduleStartDateTime = new Date(
      `${tzDate}T${todaySchedule.start_time}:00`
    );
    
    const earliestCheckInTime = new Date(
      scheduleStartDateTime.getTime() - 15 * 60 * 1000
    );
    
    const now = new Date();
    
    if (now < earliestCheckInTime) {
      showErrorToast(
        `You can only check in 15 minutes before ${todaySchedule.start_time}`
      );
      return false;
    }
    
    return true;
  };

  const loadTodaySchedule = async () => {
    try {
      setLoading(true);
      
      // ✅ Use the dedicated endpoint to get today's schedule for the logged-in user
      // Use no-cache version to ensure fresh data
      const rawToday: { todaySchedule?: ScheduleApiPayload | null } = await getTodayScheduleNoCache();
      
      console.log("📦 Raw today schedule response:", rawToday);
      
      // ❌ If no today schedule found — stop
      if (!rawToday || !rawToday.todaySchedule) {
        console.log("❌ No valid today schedule. Setting null.");
        setTodaySchedule(null);
        setLoading(false);
        return;
      }
      
      // ⏱ Start & End times (safe)
      const start_time = rawToday.todaySchedule.start_time || "";
      const end_time = rawToday.todaySchedule.end_time || "";
      const date = rawToday.todaySchedule.date || new Date().toISOString().split("T")[0];
      
      // ⏳ Duration calculation
      let duration = 0;
      if (start_time && end_time) {
        try {
          const [sh, sm] = String(start_time).split(":");
          const [eh, em] = String(end_time).split(":");
          const sD = new Date();
          sD.setHours(Number(sh), Number(sm), 0, 0);
          const eD = new Date();
          eD.setHours(Number(eh), Number(em), 0, 0);
          if (eD.getTime() < sD.getTime()) eD.setDate(eD.getDate() + 1);
          duration = (eD.getTime() - sD.getTime()) / (1000 * 60 * 60);
        } catch (e) {
          console.warn("❌ Failed to compute duration:", e);
        }
      }
      
      // 🏢 Branch info - handle both string and object types for branch_id
      const branchName = 
        rawToday.todaySchedule.branch_id && typeof rawToday.todaySchedule.branch_id === 'object' && rawToday.todaySchedule.branch_id !== null
          ? (rawToday.todaySchedule.branch_id as { _id?: string; name?: string }).name || null
          : null;
      const branchAddress = 
        rawToday.todaySchedule.branch_id && typeof rawToday.todaySchedule.branch_id === 'object' && rawToday.todaySchedule.branch_id !== null
          ? (rawToday.todaySchedule.branch_id as { _id?: string; name?: string; address?: string }).address || ""
          : "";
      
      // 📦 Final Schedule Object
      const scheduleObj: TodaySchedule = {
        start_time,
        end_time,
        duration,
        date,
        branch: branchName
          ? {
              name: branchName,
              address: branchAddress,
              rawBranch: rawToday.todaySchedule.branch_id || null,
            }
          : null,
        raw: rawToday.todaySchedule,
      };
      
      console.log("✅ Processed schedule object:", scheduleObj);
      setTodaySchedule(scheduleObj);
    } catch (err) {
      console.error("❌ Error loading today's schedule:", err);
      setTodaySchedule(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendance = async () => {
    try {
      // First, check if there's an ongoing cross-day shift
      const hasOngoingCrossDay = await hasOngoingCrossDayShift();
      
      // Simplified logic: just check the attendance status
      const isCheckedIn = hasOngoingCrossDay || await isCheckedInToday();
      const isShiftCompleted = await hasCompletedShiftToday();
      
      console.log("🔍 hasOngoingCrossDay:", hasOngoingCrossDay);
      console.log("🔍 isCheckedIn:", isCheckedIn);
      console.log("🔍 isShiftCompleted:", isShiftCompleted);
      
      // Special handling for cross-day shifts
      // If user has an ongoing cross-day shift, they should be able to check out
      // but only after the schedule end time
      if (hasOngoingCrossDay) {
        setAttendanceStatus('checked_in');
        setCheckedIn(true);
        // Will be enabled at schedule end time by the useEffect
        console.log("✅ Setting checked in for cross-day shift");
      } else if (isShiftCompleted) {
        setAttendanceStatus('shift_completed');
      } else if (isCheckedIn) {
        setAttendanceStatus('checked_in');
      } else {
        setAttendanceStatus('not_checked_in');
      }
      
      // Keep the existing detailed logic for displaying check-in/check-out times
      // Use enhanced history to include cross-day records
      const todayRecords = (await getMyAttendanceHistoryEnhanced()) as unknown as AttendanceEntry[];
      console.log("📌 Today Records from Helper:", todayRecords.length);
      console.log("📌 Today Records from Helper records:", todayRecords);
      
      if (!todayRecords || todayRecords.length === 0) {
        // no attendance today
        setAttendanceToday(null);
        setCheckInTime(null);
        setCheckOutTime(null);
        setDuration("0h 0m");
        
        // For cross-day shifts, we might still be checked in from yesterday
        // So we need to check specifically for that case
        if (hasOngoingCrossDay || await isCheckedInToday()) {
          setAttendanceStatus('checked_in');
          setCheckedIn(true);
          // Will be enabled at schedule end time by the useEffect
          console.log("✅ Setting cross-day shift checkout availability");
          
          // Set last schedule for cross-day shifts
          const lastScheduleData = await getLastSchedule();
          setLastSchedule(lastScheduleData);
        }
        return;
      }
      
      // pick latest record by In
      todayRecords.sort(
        (a, b) => moment(b.In).valueOf() - moment(a.In).valueOf()
      );
      const rec = todayRecords[0];
      setAttendanceToday(rec);
      const hasIn = !!rec.In;
      const hasOut = !!rec.Out;
      // times (HH:mm)
      const inMoment = hasIn ? moment(rec.In, "YYYY-MM-DD HH:mm:ss") : null;
      const outMoment = hasOut ? moment(rec.Out, "YYYY-MM-DD HH:mm:ss") : null;
      setCheckInTime(inMoment ? inMoment.format("HH:mm") : null);
      setCheckOutTime(outMoment ? outMoment.format("HH:mm") : null);
      // duration: if out exists use out - in, otherwise now - in
      const now = moment();
      if (inMoment) {
        const endMoment = outMoment || now;
        const diff = moment.duration(endMoment.diff(inMoment));
        const hrs = Math.floor(diff.asHours());
        const mins = diff.minutes();
        setDuration(`${hrs}h ${mins}m`);
      } else {
        setDuration("0h 0m");
      }
      // derive checked states from actual data
      setCheckedIn(hasIn && !hasOut);
      setCheckedOut(hasOut);
      
      // For cross-day shifts, we need to allow checkout if user has checked in but not checked out
      // regardless of whether we have today's schedule
      if (hasOngoingCrossDay || (hasIn && !hasOut)) {
        // If we have today's schedule and check-in time, enable checkout at schedule end time
        if (todaySchedule?.end_time && inMoment) {
          const [eh, em] = todaySchedule.end_time.split(":").map(Number);
          let scheduleEnd = inMoment.clone().set({ hour: eh, minute: em, second: 0 });
          if (scheduleEnd.isBefore(inMoment)) scheduleEnd.add(1, "day");
          
          // Enable checkout starting from schedule end time
          const now = moment();
          const shouldEnableCheckout = now.isSameOrAfter(scheduleEnd);
          setCanCheckOut(shouldEnableCheckout);
        } else {
          // If no today's schedule (e.g., cross-day shift opened the next day), 
          // don't enable checkout until we can determine the schedule end time
          setCanCheckOut(false);
          
          // Set last schedule for cross-day shifts
          const lastScheduleData = await getLastSchedule();
          setLastSchedule(lastScheduleData);
        }
        console.log("✅ Enabling checkout for ongoing shift");
      } else {
        // 🔥 canCheckOut logic: use shift end time (primary, ignore duration for now)
        // Only apply time-based logic if we have a complete shift (both check-in and check-out)
        let allowedToCheckOut = false;
        if (hasIn && !hasOut && inMoment) {
          // First try to use today's schedule if available
          if (todaySchedule?.end_time) {
            const [eh, em] = todaySchedule.end_time.split(":").map(Number);
            let shiftEndMoment = inMoment
              .clone()
              .set({ hour: eh, minute: em, second: 0 });
            if (shiftEndMoment.isBefore(inMoment)) shiftEndMoment.add(1, "day");
            allowedToCheckOut = now.isSameOrAfter(shiftEndMoment);
          } 
          // If no today's schedule (e.g., cross-day shift opened the next day), 
          // don't enable checkout until we can determine the schedule end time
          else {
            allowedToCheckOut = false;
          }
        }
        setCanCheckOut(allowedToCheckOut);
      }
    } catch (err) {
      console.error("❌ fetchAttendance error:", err);
      setAttendanceToday(null);
      setCheckInTime(null);
      setCheckOutTime(null);
      setDuration("0h 0m");
      setCheckedIn(false);
      setCheckedOut(false);
      setCanCheckOut(false);
      setAttendanceStatus('not_checked_in');
    }
  };

  const refreshLocation = async () => {
    try {
      // ✅ Check if we have a recent location cached
      const now = Date.now();
      if (lastLocationCache.current && 
          lastLocationCache.current.timestamp > now - 30000) { // 30 seconds cache
        console.log("✅ Using cached location data");
        const cachedLoc = lastLocationCache.current.location;
        
        // ✅ Log user's current location coordinates
        console.log("📍 User Location Coordinates:", {
          latitude: cachedLoc.coords.latitude,
          longitude: cachedLoc.coords.longitude
        });
        
        const distance = getDistance(
          cachedLoc.coords.latitude,
          cachedLoc.coords.longitude,
          SHOP_LAT,
          SHOP_LON
        );
        setDistance(distance);
        setWithinRange(distance <= CHECKIN_RADIUS);
        console.log("📏 Cached distance updated:", distance.toFixed(2), "meters");
        return;
      }

      // ✅ Request high accuracy location with timeout to prevent hanging
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("❌ Location permission denied");
        return;
      }
      
      // ✅ Use faster location acquisition
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced // Reduced accuracy for faster response
      });
      
      // ✅ Log user's current location coordinates
      console.log("📍 User Location Coordinates:", {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      });
      
      // ✅ Cache the location
      lastLocationCache.current = {
        location: loc,
        timestamp: now
      };
      
      const distance = getDistance(
        loc.coords.latitude,
        loc.coords.longitude,
        SHOP_LAT,
        SHOP_LON
      );
      setDistance(distance);
      setWithinRange(distance <= CHECKIN_RADIUS);
      console.log("📏 Distance updated:", distance.toFixed(2), "meters");
    } catch (err) {
      console.log("❌ Error refreshing location:", err);
      
      // ✅ Fallback: try again with lower accuracy if high accuracy fails
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low // Low accuracy as fallback
        });
        
        // ✅ Log user's current location coordinates
        console.log("📍 User Location Coordinates (Fallback):", {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude
        });
        
        const now = Date.now();
        // ✅ Cache the location
        lastLocationCache.current = {
          location: loc,
          timestamp: now
        };
        
        const distance = getDistance(
          loc.coords.latitude,
          loc.coords.longitude,
          SHOP_LAT,
          SHOP_LON
        );
        setDistance(distance);
        setWithinRange(distance <= CHECKIN_RADIUS);
        console.log("📏 Distance updated (fallback):", distance.toFixed(2), "meters");
      } catch (fallbackErr) {
        console.log("❌ Fallback location also failed:", fallbackErr);
      }
    }
  };

  const reloadAll = async () => {
    // ✅ Smart reload: Only fetch data if needed
    try {
      // Always refresh location
      await refreshLocation();
      
      // ✅ Always fetch schedule (needed for UI display)
      await loadTodaySchedule();
      
      // Always fetch attendance to properly handle cross-day shifts
      await fetchAttendance();
    } catch (error) {
      console.error("❌ Error in smart reload:", error);
    }
  };

  // Test notification functions removed as they are no longer needed

  // ✅ Overall Auto Refresh: Reduced interval to 5 minutes to decrease API load
  // This also ensures cross-day shifts are properly detected when user opens app next day
  useEffect(() => {
    // Ensure we detect cross-day shifts on initial load
    const initializeApp = async () => {
      // First check for cross-day shifts
      const hasOngoingCrossDay = await hasOngoingCrossDayShift();
      if (hasOngoingCrossDay) {
        // If there's an ongoing cross-day shift, make sure we show the checkout button
        // at the appropriate time (schedule end time)
        setAttendanceStatus('checked_in');
        setCheckedIn(true);
        
        // For cross-day shifts, we want to show the checkout button immediately
        // but only enable it after the schedule end time
        setCanCheckOut(false); // Will be enabled at schedule end time
        
        // Set last schedule for cross-day shifts
        const lastScheduleData = await getLastSchedule();
        setLastSchedule(lastScheduleData);
        
        console.log("✅ Detected ongoing cross-day shift on initial load");
      } else {
        // Recheck with last schedule and attendance data if no ongoing cross-day shift
        const lastSchedule = await getLastSchedule();
        const lastAttendance = await getLastAttendanceRecord();
        
        // Set last schedule
        setLastSchedule(lastSchedule);
        
        // If we have last schedule and attendance data, and the user is checked in but not checked out
        if (lastSchedule && lastAttendance && lastAttendance.In && !lastAttendance.Out) {
          // Check if the schedule end time has passed
          const inMoment = moment(lastAttendance.In, "YYYY-MM-DD HH:mm:ss");
          const [eh, em] = lastSchedule.end_time.split(":").map(Number);
          let scheduleEnd = inMoment.clone().set({ hour: eh, minute: em, second: 0 });
          if (scheduleEnd.isBefore(inMoment)) scheduleEnd.add(1, "day");
          
          // Enable checkout if schedule end time has passed
          const now = moment();
          const shouldEnableCheckout = now.isSameOrAfter(scheduleEnd);
          if (shouldEnableCheckout) {
            setAttendanceStatus('checked_in');
            setCheckedIn(true);
            setCanCheckOut(true);
            console.log("✅ Detected completed schedule with pending checkout");
          } else {
            // If schedule end time hasn't passed yet, still show that user is checked in
            // but don't enable checkout until schedule end time
            setAttendanceStatus('checked_in');
            setCheckedIn(true);
            setCanCheckOut(false);
            console.log("✅ Detected ongoing schedule with pending checkout");
          }
        }
      }
      
      // Then do the regular reload
      void reloadAll();
    };
    
    void initializeApp();

    const interval = setInterval(reloadAll, 1000 * 60 * 5); // Every 5 minutes for overall refresh
    return () => clearInterval(interval);
  }, [userId, currentUser?.branch]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const user = await getProfile();
        setCurrentUser(user);
      } catch (err) {
        console.error(err);
      }
    };
    void fetchProfile();
  }, []);

  // ✅ Clear schedule cache on component mount for debugging
  useEffect(() => {
    clearScheduleCache();
  }, []);

  useEffect(() => {
    console.log("📌 todaySchedule updated:", todaySchedule);
  }, [todaySchedule]);

  useEffect(() => {
    // If we have a checkout time, don't allow checkout
    if (checkOutTime) {
      setCanCheckOut(false);
      return;
    }
    
    // For cross-day shifts, we need to allow checkout if user has checked in but not checked out
    // regardless of whether we have today's schedule
    if (checkedIn && !checkOutTime) {
      // First, try to use today's schedule if available
      if (todaySchedule?.end_time && checkInTime) {
        const inMoment = moment(checkInTime, "HH:mm");
        const [eh, em] = todaySchedule.end_time.split(":").map(Number);
        let scheduleEnd = inMoment.clone().set({ hour: eh, minute: em, second: 0 });
        if (scheduleEnd.isBefore(inMoment)) scheduleEnd.add(1, "day");
        
        // Enable checkout starting from schedule end time
        const now = moment();
        const shouldEnableCheckout = now.isSameOrAfter(scheduleEnd);
        setCanCheckOut(shouldEnableCheckout);
        
        // Update periodically to ensure accurate timing
        const timer = setInterval(() => {
          const now = moment();
          const shouldEnableCheckout = now.isSameOrAfter(scheduleEnd);
          setCanCheckOut(shouldEnableCheckout);
        }, 1000);
        return () => { clearInterval(timer); };
      } else {
        // If no today's schedule (e.g., cross-day shift opened the next day), 
        // recheck with last schedule data to determine when checkout should be enabled
        const recheckCheckoutAvailability = async () => {
          const lastSchedule = await getLastSchedule();
          const lastAttendance = await getLastAttendanceRecord();
          
          // If we have last schedule and attendance data, use that to determine checkout time
          if (lastSchedule && lastAttendance && lastAttendance.In && !lastAttendance.Out) {
            const inMoment = moment(lastAttendance.In, "YYYY-MM-DD HH:mm:ss");
            const [eh, em] = lastSchedule.end_time.split(":").map(Number);
            let scheduleEnd = inMoment.clone().set({ hour: eh, minute: em, second: 0 });
            if (scheduleEnd.isBefore(inMoment)) scheduleEnd.add(1, "day");
            
            // Enable checkout starting from schedule end time
            const now = moment();
            const shouldEnableCheckout = now.isSameOrAfter(scheduleEnd);
            setCanCheckOut(shouldEnableCheckout);
            
            // Update periodically to ensure accurate timing
            const timer = setInterval(() => {
              const now = moment();
              const shouldEnableCheckout = now.isSameOrAfter(scheduleEnd);
              setCanCheckOut(shouldEnableCheckout);
            }, 1000);
            return () => clearInterval(timer);
          } else {
            // Fallback: If we can't determine schedule end time, don't enable checkout
            // This prevents accidental early checkout
            setCanCheckOut(false);
          }
        };
        
        void recheckCheckoutAvailability();
      }
    }
  }, [checkedIn, checkInTime, todaySchedule, checkOutTime]);

  const formatTime12h = (input: Date | string) => {
    let date: Date;
    if (typeof input === "string") {
      // If already contains AM/PM, just return it
      if (
        input.toUpperCase().includes("AM") ||
        input.toUpperCase().includes("PM")
      ) {
        return input;
      }
      // If string like "HH:mm" or "HH:mm:ss"
      const [hourStr, minuteStr] = input.split(":");
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);
      date = new Date();
      date.setHours(hour, minute, 0, 0);
    } else {
      date = input;
    }
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12; // convert 0 to 12
    const minuteStr = minutes.toString().padStart(2, "0");
    return `${hours}:${minuteStr} ${ampm}`;
  };

  const parse12hToDate = (timeStr?: string | null): Date | null => {
    if (!timeStr) return null;
    const s = String(timeStr).trim();
    const regex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/;
    const m = s.match(regex);
    if (!m) return null;
    let hours = parseInt(m[1], 10);
    const minutes = parseInt(m[2], 10);
    const seconds = m[3] ? parseInt(m[3], 10) : 0;
    const modifier = m[4];
    if (modifier) {
      const mod = modifier.toLowerCase();
      if (mod === "pm" && hours < 12) hours += 12;
      if (mod === "am" && hours === 12) hours = 0;
    }
    const d = new Date();
    d.setHours(
      isNaN(hours) ? 0 : hours,
      isNaN(minutes) ? 0 : minutes,
      isNaN(seconds) ? 0 : seconds,
      0
    );
    return d;
  };

  const calculateDuration = (
    checkInTime: string | null,
    checkOutTime: string | null
  ) => {
    if (!checkInTime) return "0h 0m";
    const start = parse12hToDate(checkInTime);
    if (!start) return "0h 0m";
    let end: Date | null = null;
    if (checkOutTime) {
      end = parse12hToDate(checkOutTime) || new Date();
    } else {
      end = new Date();
    }
    if (end.getTime() < start.getTime()) {
      end.setDate(end.getDate() + 1);
    }
    const diffMs = end.getTime() - start.getTime();
    if (!isFinite(diffMs) || diffMs < 0) return "0h 0m";
    const diffMinutes = Math.floor(diffMs / 60000);
    const hrs = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    return `${hrs > 0 ? hrs + "h " : "0h "}${mins}m`;
  };

  useEffect(() => {
    if (!checkedIn) return;
    const interval = setInterval(() => {
      setDuration(calculateDuration(checkInTime, checkOutTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [checkedIn, checkInTime, checkOutTime]);

  // formatTime helper
  const formatTime = (time: string | Date | null) => {
    if (!time) return "--:--";
    if (time instanceof Date) return formatTime12h(time);
    const s = String(time);
    if (s.toLowerCase().includes("am") || s.toLowerCase().includes("pm"))
      return s;
    return formatTime12h(parse12hToDate(s) ?? new Date());
  };

  const getBranchIdFromSchedule = () => {
    return (
      getBranchReferenceId(todaySchedule?.raw.branch_id) ??
      getBranchReferenceId(todaySchedule?.branch?.rawBranch) ??
      null
    );
  };

  // ✅ Add manual schedule fetch function for debugging
  const fetchScheduleManually = async () => {
    console.log("🔍 Manually fetching schedule...");
    setLoading(true);
    await loadTodaySchedule();
    setLoading(false);
  };

  const handleCheckIn = async () => {
    if (!todaySchedule) {
      setShowCheckInLoading(false);
      showErrorToast(lang.noScheduleToday);
      return;
    }
    
    // ✅ Check if current time is past the scheduled end time (optimized)
    try {
      // Create schedule end datetime with proper date (simplified)
      const [endHours, endMinutes] = todaySchedule.end_time.split(":").map(Number);
      const [startHours, startMinutes] = todaySchedule.start_time.split(":").map(Number);
      
      // Create date objects for today with the schedule times
      const scheduleEndDateTime = new Date();
      scheduleEndDateTime.setHours(endHours, endMinutes, 0, 0);
      
      const scheduleStartDateTime = new Date();
      scheduleStartDateTime.setHours(startHours, startMinutes, 0, 0);
      
      const now = new Date();
      
      // Handle case where end time is next day (e.g., start 23:00, end 06:00)
      if (scheduleEndDateTime < scheduleStartDateTime) {
        scheduleEndDateTime.setDate(scheduleEndDateTime.getDate() + 1);
      }
      
      // Prevent check-in if current time is past the scheduled end time
      if (now > scheduleEndDateTime) {
        setShowCheckInLoading(false);
        showErrorToast(
          `Cannot check in after scheduled end time ${todaySchedule.end_time}`
        );
        return;
      }
    } catch (dateError) {
      console.error("Error parsing schedule dates:", dateError);
      // If there's an error in date parsing, we'll skip the validation
      // but log the error for debugging
    }
    
    try {
      // ✅ Use cached location if available (check first before requesting permissions)
      const now = Date.now();
      let loc;
      
      // Check if we have a recent location cached
      if (lastLocationCache.current && 
          lastLocationCache.current.timestamp > now - 30000) { // 30 seconds cache
        console.log("✅ Using cached location data for check-in");
        loc = lastLocationCache.current.location;
      } else {
        // Only request permissions if we don't have a recent cached location
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setShowCheckInLoading(false);
          showErrorToast("Location permission denied.");
          return;
        }
        
        // Get fresh location
        loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        
        // Cache the location
        lastLocationCache.current = {
          location: loc,
          timestamp: now
        };
      }
      
      // ✅ Log both branch and user location coordinates at check-in
      console.log("📋 Check-in Location Data:", {
        userLocation: {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude
        },
        branchLocation: {
          name: branchInfo?.name,
          latitude: branchInfo?.coordinates?.latitude,
          longitude: branchInfo?.coordinates?.longitude
        },
        distanceToBranch: getDistance(
          loc.coords.latitude,
          loc.coords.longitude,
          branchInfo?.coordinates?.latitude || 0,
          branchInfo?.coordinates?.longitude || 0
        ).toFixed(2) + " meters"
      });
      
      // Show loading immediately after getting location
      setShowCheckInLoading(true);
      
      const payload = {
        latitude: loc.coords.latitude.toString(),
        longitude: loc.coords.longitude.toString(),
        // Removed branchId since backend doesn't use it
      };
      
      const response = await startAttendance(payload);
      
      if (response && response.success) {
        setShowCheckInLoading(false);
        showSuccessToast(lang.checkInSuccess);
        
        // ✅ Use the success response from API instead of fetching attendance again
        if (response.attendance) {
          // Update the local state with the attendance data from the response
          // Parse the datetime string and format it to HH:mm
          const inMoment = moment(response.attendance.In, "YYYY-MM-DD HH:mm:ss");
          setCheckInTime(inMoment.format("HH:mm"));
          setCheckedIn(true);
          setAttendanceStatus('checked_in');
          setDuration("0h 0m"); // Reset duration
        
          // ✅ Schedule alarm notification 2 minutes before shift end
          if (todaySchedule) {
            const notificationId = await scheduleEndShiftAlarm(todaySchedule, response.attendance.In);
            if (notificationId) {
              console.log(`🔔 Alarm scheduled with ID: ${notificationId}`);
              // Store the notification ID in local state or storage for potential cancellation
              // For now, we'll just log it
            }
          }
        
          // ✅ Schedule checkout reminders at shift end time and every 2 minutes after
          if (todaySchedule) {
            try {
              const reminderIds = await scheduleCheckoutReminders(todaySchedule, response.attendance.In);
              if (reminderIds) {
                // Store the notification IDs for potential cancellation on checkout
                setCheckoutReminderIds(reminderIds);
              }
            } catch (error) {
              console.error("❌ Error scheduling checkout reminders:", error);
            }
          }
        }
        
        // ✅ Reduce delay for success loading page to improve UX
        setShowCheckInSuccessLoading(true);
        
        // ✅ Shorter delay to show the success loading page before refreshing
        setTimeout(() => {
          setShowCheckInSuccessLoading(false);
        }, 50); // Reduced from 100ms to 50ms
      } else {
        setShowCheckInLoading(false);
        showErrorToast(lang.Check_in_failed);
      }
    } catch (error: unknown) {
      const apiError = error as ApiError;
      setShowCheckInLoading(false); // ✅ Hide loading overlay on error
      setShowCheckInSuccessLoading(false); // ✅ Hide success loading on error
      console.error("Check-in error:", error);
      
      // ✅ Handle specific 403 error with user-friendly message
      if (apiError.response?.status === 403) {
        // Check for specific error messages
        const errorMessage = apiError.response.data?.message;
        if (errorMessage && errorMessage.includes("already have an active session")) {
          showErrorToast("You already have an active session. Please checkout first.");
        } else {
          showErrorToast("Access denied. Please contact your administrator.");
        }
      } 
      // ✅ Handle other specific errors
      else if (apiError.response?.status === 400) {
        showErrorToast("Invalid checkin request. Please try again.");
      } 
      else if (apiError.response?.status === 500) {
        showErrorToast("Server error. Please try again later.");
      }
      // ✅ Fallback to generic error message
      else {
        showErrorToast(apiError.response?.data?.message || lang.Check_in_failed);
      }
    }
  };

  const handleCheckOut = async () => {
    if (!checkInTime) {
      setShowCheckOutLoading(false);
      showErrorToast(lang.notCheckedIn);
      return;
    }
    if (!todaySchedule) {
      setShowCheckOutLoading(false);
      showErrorToast(lang.genericNoSchedule);
      return;
    }
    try {
      // ✅ Use cached location if available (check first before requesting permissions)
      const now = Date.now();
      let loc;
      
      // Check if we have a recent location cached
      if (lastLocationCache.current && 
          lastLocationCache.current.timestamp > now - 30000) { // 30 seconds cache
        console.log("✅ Using cached location data for check-out");
        loc = lastLocationCache.current.location;
      } else {
        // Only request permissions if we don't have a recent cached location
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setShowCheckOutLoading(false);
          showErrorToast("Location permission denied.");
          return;
        }
        
        // Get fresh location
        loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        
        // Cache the location
        lastLocationCache.current = {
          location: loc,
          timestamp: now
        };
      }
      
      // Show loading immediately after getting location
      setShowCheckOutLoading(true);
      
      const payload = {
        latitude: loc.coords.latitude.toString(),
        longitude: loc.coords.longitude.toString(),
        // Removed branchId since backend doesn't use it
      };
      
      const response = await endAttendance(payload);
      
      if (response && response.success) {
        setShowCheckOutLoading(false);
        showSuccessToast(lang.checkOutSuccess);
        
        // ✅ Use the success response from API instead of fetching attendance again
        if (response.attendance) {
          // Update the local state with the attendance data from the response
          // Parse the datetime strings and format them to HH:mm
          const inMoment = moment(response.attendance.In, "YYYY-MM-DD HH:mm:ss");
          const outMoment = moment(response.attendance.Out, "YYYY-MM-DD HH:mm:ss");
          setCheckInTime(inMoment.format("HH:mm"));
          setCheckOutTime(outMoment.format("HH:mm"));
          setCheckedOut(true);
          setCheckedIn(false);
          setAttendanceStatus('shift_completed');
          
          // Calculate duration based on check-in and check-out times
          const diff = moment.duration(outMoment.diff(inMoment));
          const hrs = Math.floor(diff.asHours());
          const mins = diff.minutes();
          setDuration(`${hrs}h ${mins}m`);
          
          // ✅ Cancel any scheduled alarm notification
          // Note: In a real implementation, you would store the notification ID
          // and use it to cancel the specific notification
          // For now, we'll just log that we should cancel
          console.log("🔕 Cancelling scheduled alarm notification");
          
          // ✅ Cancel any scheduled checkout reminders
          if (checkoutReminderIds) {
            await cancelAllScheduledCheckoutReminders(checkoutReminderIds);
            setCheckoutReminderIds(null);
            console.log("🔕 Cancelling scheduled checkout reminders");
          }
        }
      } else {
        setShowCheckOutLoading(false);
        showErrorToast(lang.Check_out_failed);
      }
    } catch (error: unknown) {
      const apiError = error as ApiError;
      setShowCheckOutLoading(false); // ✅ Hide loading overlay on error
      console.error("Check-out error:", error);
      
      // ✅ Handle specific 403 error with user-friendly message
      if (apiError.response?.status === 403) {
        // Check for specific error messages
        const errorMessage = apiError.response.data?.message;
        if (errorMessage && errorMessage.includes("already have an active session")) {
          showErrorToast("You already have an active session. Please try again.");
        } else {
          showErrorToast("Access denied. Please contact your administrator.");
        }
      } 
      // ✅ Handle other specific errors
      else if (apiError.response?.status === 400) {
        showErrorToast("Invalid checkout request. Please try again.");
      } 
      else if (apiError.response?.status === 500) {
        showErrorToast("Server error. Please try again later.");
      }
      // ✅ Fallback to generic error message
      else {
        showErrorToast(apiError.response?.data?.message || lang.Check_out_failed);
      }
    }
  };

  const getDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const checkDistance = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        const distance = getDistance(
          loc.coords.latitude,
          loc.coords.longitude,
          SHOP_LAT,
          SHOP_LON
        );
        setDistance(distance);
        console.log("📏 Current distance to shop:", distance, "meters");
        if (distance <= CHECKIN_RADIUS) {
          setWithinRange(true);
          // user is inside → stop auto-check after a small cooldown
          clearTimeout(timer);
          timer = setTimeout(() => {
            console.log("⏹️ Auto distance check paused because user is inside");
          }, 2000);
        } else {
          setWithinRange(false);
          // user is outside → keep checking every 10 seconds
          timer = setTimeout(checkDistance, 10000);
        }
      } catch (error) {
        console.log("❌ Distance check failed:", error);
      }
    };
    if (SHOP_LAT !== 0 || SHOP_LON !== 0) {
      void checkDistance();
    }
    return () => { clearTimeout(timer); };
  }, [SHOP_LAT, SHOP_LON]);

  const formatTo12Hour = (time?: string): string => {
    if (!time) return "";
    const [hour, minute] = time.split(":");
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${minute} ${ampm}`;
  };

  // ✅ Update the onRefresh function to include loading scheduled alarms
  const onRefresh = async () => {
    setRefreshing(true);
    // ✅ Force a full reload when user manually refreshes
    // ✅ Clear cache to ensure fresh data
    clearScheduleCache();
    await Promise.all([
      loadTodaySchedule(), 
      refreshLocation(), 
      fetchAttendance(),
      loadScheduledAlarms() // ✅ Load scheduled alarms on refresh
    ]);
    setRefreshing(false);
  };

  // ✅ Function to load scheduled alarms
  const loadScheduledAlarms = async () => {
    try {
      const alarms = await getScheduledNotifications();
      setScheduledAlarms(alarms);
    } catch (error) {
      console.error("Error loading scheduled alarms:", error);
    }
  };

  // ✅ Function to set a custom alarm
  const setCustomAlarm = async () => {
    if (!alarmTime) {
      showErrorToast("Please select an alarm time");
      return;
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(alarmTime)) {
      showErrorToast("Please enter a valid time in HH:MM format");
      return;
    }

    try {
      // Parse the alarm time
      const [hours, minutes] = alarmTime.split(":").map(Number);
      const alarmDate = new Date();
      alarmDate.setHours(hours, minutes, 0, 0);

      // If the alarm time is in the past, set it for tomorrow
      const now = new Date();
      if (alarmDate <= now) {
        alarmDate.setDate(alarmDate.getDate() + 1);
      }

      const notificationId = await scheduleCustomAlarm(
        alarmTitle || "Custom Alarm",
        alarmMessage || "This is your custom alarm",
        alarmDate
      );

      if (notificationId) {
        showSuccessToast("Custom alarm set successfully");
        // Reload scheduled alarms
        void loadScheduledAlarms();
        // Clear input fields
        setAlarmTime("");
      } else {
        showErrorToast("Failed to set custom alarm");
      }
    } catch (error) {
      console.error("Error setting custom alarm:", error);
      showErrorToast("Failed to set custom alarm");
    }
  };

  // ✅ Function to cancel an alarm
  const cancelAlarm = async (notificationId: string) => {
    try {
      await cancelNotification(notificationId);
      showSuccessToast("Alarm cancelled successfully");
      // Reload scheduled alarms
      loadScheduledAlarms();
    } catch (error) {
      console.error("Error cancelling alarm:", error);
      showErrorToast("Failed to cancel alarm");
    }
  };

  // ✅ Load scheduled alarms when component mounts and set up periodic refresh
  useEffect(() => {
    // Load scheduled alarms immediately
    loadScheduledAlarms();
    
    // Set up interval to refresh scheduled alarms every minute
    const interval = setInterval(() => {
      loadScheduledAlarms();
    }, 60000); // Every minute
    
    return () => clearInterval(interval);
  }, []);

  // ---------- JSX (return) ----------
  const displayBranchAddress = () => {
    if (!branchInfo) return "No branch address";
    if (typeof branchInfo.address === "string") return branchInfo.address;
    if (branchInfo.coordinates) {
      return `Lat: ${branchInfo.coordinates.latitude.toFixed(6)}, Lon: ${branchInfo.coordinates.longitude.toFixed(6)}`;
    }
    return "Address not available";
  };

  const today = new Date().toLocaleDateString(
    langId === "de" ? "de-DE" : "en-US",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  );

  return (
    <>
      {/* ✅ Hidden debug button - uncomment for testing */}
      {/* <Button1
        text="Debug: Fetch Schedule"
        onPress={fetchScheduleManually}
        containerStyle={{ margin: 10, backgroundColor: 'red' }}
      /> */}
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: lang.timeTrack, color: colors.text }}
        right={{
          type: "image",
          url: require("../../../assets/icons/f_notification_b.png"),
          width: 24,
          height: 24,
          onPress: () => {
            navigation.navigate("C_NotificationScreen", {
              userId,
              langId: currentLang,
            });
          },
        }}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.date}>{today}</Text>
        <Text style={styles.welcome} numberOfLines={1} ellipsizeMode="tail">
          {lang.welcome} {loading ? "..." : currentUser?.fullname || "Guest"}
        </Text>
        {/* Heading */}
        <View style={styles.headingContainer}>
          <Image
            source={require("../../../assets/icons/f_schedule_b.png")}
            style={styles.headingIcon}
          />
          <Text style={styles.headingText}>{lang.todaySchedule}</Text>
        </View>
        <CartBox
          backgroundColor="#F1F2F4"
          borderRadius={12}
          width={"100%"}
          alignItems="flex-start"
          paddingTop={10}
          paddingBottom={10}
          paddingLeft={10}
        >
          <View style={styles.addressContainer}>
            {/* 🟢 TOP LINE → Schedule today? or no schedule */}
            {todaySchedule && branchInfo ? (
              <View style={styles.addressLine}>
                <Image
                  source={require("../../../assets/icons/branch.png")}
                  style={styles.addressIcon1}
                />
                <Text style={styles.addressText}>{branchInfo.name}</Text>
              </View>
            ) : (
              <View style={styles.addressLine}>
                <Text
                  style={[styles.addressText, { color: colors.button_text }]}
                >
                  {lang.noScheduleToday ??
                    "No assignment or shift scheduled for today."}
                </Text>
              </View>
            )}
            {/* 🟡 ADDRESS (only if available) */}
            {(branchInfo?.address || todaySchedule?.branch?.address) && (
              <View style={styles.addressLine}>
                <Image
                  source={require("../../../assets/icons/location.png")}
                  style={styles.addressIcon}
                />
                <Text
                  style={[
                    styles.addressText,
                    { fontSize: 14, color: "#555", width: "70%" },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {displayBranchAddress()}
                </Text>
              </View>
            )}
            {/* 🔵 TIME ROW (only if schedule exists) */}
            {(todaySchedule?.start_time || todaySchedule?.end_time) && (
              <View style={styles.addressLine}>
                <Image
                  source={require("../../../assets/icons/clock.png")}
                  style={styles.addressIcon}
                />
                <Text
                  style={[styles.addressText, { fontSize: 14, color: "#333" }]}
                >
                  {formatTime(todaySchedule.start_time)} -{" "}
                  {formatTime(todaySchedule.end_time)}
                </Text>
              </View>
            )}
            
            {/* 🟣 SCHEDULE DETAILS FOR CROSS-DAY SHIFTS */}
            {/* {checkedIn && !checkOutTime && todaySchedule && (
              <View style={[styles.addressLine, { marginTop: 5 }]}>                
                <Text
                  style={[styles.addressText, { fontSize: 12, color: "#666", fontStyle: 'italic' }]}
                >
                  Scheduled shift: {todaySchedule.date} {formatTime(todaySchedule.start_time)} - {formatTime(todaySchedule.end_time)}
                </Text>
              </View>
            )} */}
            
            {/* 🟤 LAST SCHEDULE DETAILS FOR CROSS-DAY SHIFTS (when no today schedule) */}
            {checkedIn && !checkOutTime && !todaySchedule && lastSchedule && (
              <View style={[styles.addressLine, { marginTop: 5 }]}>                
                <Text
                  style={[styles.addressText, { fontSize: 12, color: "#666", fontStyle: 'italic' }]}
                >
                  Scheduled shift: {lastSchedule.date ?? ""} {formatTime(lastSchedule.start_time ?? "")} - {formatTime(lastSchedule.end_time ?? "")}
                </Text>
              </View>
            )}
            
            {/* 🟠 SCHEDULE END TIME DISPLAY */}
            {/* {checkedIn && !checkOutTime && (
              <View style={[styles.addressLine, { marginTop: 5 }]}>                
                <Text
                  style={[styles.addressText, { fontSize: 12, color: "#666", fontStyle: 'italic' }]}
                >
                  Shift ends at: {' '}
                  {todaySchedule?.end_time ? formatTime(todaySchedule.end_time) : 
                   (lastSchedule?.end_time ? formatTime(lastSchedule.end_time) : '')}
                </Text>
              </View>
            )} */}
          </View>
        </CartBox>
        
        {/* Simplified logic for showing appropriate buttons */}
        {attendanceStatus === 'not_checked_in' ? (
          <>
            <View style={styles.middle}>
              <Image
                source={require("../../../assets/icons/timer_gray.png")}
                style={styles.icon}
              />
              <Text style={styles.subText}>{lang.readyToStartShift}</Text>
            </View>
            <Button1
              text={lang.checkIn}
              onPress={() => {
                // First check if there's an ongoing cross-day shift
                // If so, prevent check-in and show checkout button instead
                if (checkedIn) {
                  showErrorToast("You are already checked in. Please check out first.");
                  return;
                }
                
                if (!todaySchedule || !branchInfo) {
                  showErrorToast(lang.noScheduleToday);
                  return;
                }
                if (!withinRange) {
                  showErrorToast(lang.tooFarFromShop);
                  return;
                }
                if (handleCheckInAttempt()) {
                  setShowPopup(true);
                }
              }}
              backgroundColor={
                todaySchedule && branchInfo && withinRange && canCheckIn && !checkedIn
                  ? colors.primary
                  : colors.button_background
              }
              textStyle={{
                color:
                  todaySchedule && branchInfo && withinRange && canCheckIn && !checkedIn
                    ? colors.button_background
                    : colors.subtext2,
              }}
              containerStyle={styles.checkinBtn}
            />
{/* Test notification buttons removed as they are no longer needed */}
          </>
        ) : attendanceStatus === 'checked_in' ? (
          <View style={{ width: "100%", alignItems: "flex-start" }}>
            <View style={styles.statusRow}>
              <Text
                style={{
                  fontWeight: "600",
                  flex: 1,
                  fontSize: fonts.size.l,
                  marginRight: 20,
                }}
              >
                {lang.currentStatus}
              </Text>
              <View
                style={{
                  backgroundColor: colors.primary, // same bg always
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: 20,
                }}
              >
                <Text
                  style={{
                    color: colors.secondary,
                    fontSize: fonts.size.s,
                    fontWeight: fonts.weight.medium,
                  }}
                >
                  {lang.onDuty}
                </Text>
              </View>
            </View>
            <View style={styles.infoBox}>
              {checkInTime && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{lang.checkedInAt}</Text>
                  <Text style={styles.infoValue}>
                    {formatTo12Hour(checkInTime)}
                  </Text>
                </View>
              )}
              {checkInTime && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{lang.duration}</Text>
                  <Text style={styles.durationValue}>{duration}</Text>
                </View>
              )}
            </View>
            {/* Show checkout button only if canCheckOut */}
            {canCheckOut && (
              <Button1
                text={lang.checkOut}
                backgroundColor={colors.primary}
                textStyle={{
                  color: colors.secondary,
                }}
                containerStyle={styles.checkinBtn}
                onPress={() => {
                  // Show loading immediately when checkout button is pressed
                  setShowCheckOutLoading(true);
                  // Delay the actual checkout process slightly to allow UI to update
                  setTimeout(() => {
                    void handleCheckOut();
                  }, 100);
                }}
              />
            )}
            {!canCheckOut && checkedIn && !checkOutTime && (
              <Text style={{ color: colors.subtext2, fontSize: fonts.size.s, marginTop: 5 }}>
                Checkout available after scheduled end time{' '}
                {todaySchedule?.end_time ? formatTime(todaySchedule.end_time) : 
                 (lastSchedule?.end_time ? formatTime(lastSchedule.end_time) : '')}
              </Text>
            )}
            <Popup
              visible={showCheckoutPopup}
              onClose={() => { setShowCheckoutPopup(false); }}
              popupBorderColor={colors.primary}
              dismissOnOverlayPress={false}
              title={lang.confirmCheckOut}
              titleStyle={{ color: colors.primary }}
            >
              <Text style={styles.popupText}>{lang.checkoutMessage}</Text>
              <View style={styles.popupBtnContainer}>
                <Button1
                  text={lang.yes}
                  backgroundColor={colors.primary}
                  width="45%"
                  onPress={() => {
                    handleCheckOut();
                    setShowCheckoutPopup(false);
                  }}
                />
                <Button1
                  text={lang.no}
                  backgroundColor={colors.error_text}
                  width="45%"
                  onPress={() => setShowCheckoutPopup(false)}
                />
              </View>
            </Popup>
          </View>
        ) : (
          // Shift completed - show completed status
          <View style={{ width: "100%", alignItems: "flex-start" }}>
            <View style={styles.statusRow}>
              <Text
                style={{
                  fontWeight: "600",
                  flex: 1,
                  fontSize: fonts.size.l,
                  marginRight: 20,
                }}
              >
                {lang.currentStatus}
              </Text>
              <View
                style={{
                  backgroundColor: colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: 20,
                }}
              >
                <Text
                  style={{
                    color: colors.secondary,
                    fontSize: fonts.size.s,
                    fontWeight: fonts.weight.medium,
                  }}
                >
                  {lang.offDuty}
                </Text>
              </View>
            </View>
            <View style={styles.infoBox}>
              {checkInTime && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{lang.checkedInAt}</Text>
                  <Text style={styles.infoValue}>
                    {formatTo12Hour(checkInTime)}
                  </Text>
                </View>
              )}
              {checkOutTime && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{lang.checkedOutAt}</Text>
                  <Text style={styles.infoValue}>
                    {checkOutTime.toUpperCase().includes("AM") ||
                    checkOutTime.toUpperCase().includes("PM")
                      ? checkOutTime
                      : formatTo12Hour(checkOutTime)}
                  </Text>
                </View>
              )}
              {checkInTime && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{lang.duration}</Text>
                  <Text style={styles.durationValue}>{duration}</Text>
                </View>
              )}
            </View>
            <View style={{ width: "100%", alignItems: "center", marginTop: 20 }}>
              <Text style={{ color: colors.subtext2, fontSize: fonts.size.m }}>
                You have already completed your shift for today.
              </Text>
            </View>
          </View>
        )}
        
        <Popup
          visible={showPopup}
          onClose={() => setShowPopup(false)}
          popupBorderColor={colors.primary}
          dismissOnOverlayPress={false}
          title={lang.confirmCheckIn}
          titleStyle={{ color: colors.primary }}
        >
          <Text style={styles.popupText}>
            {lang.checkinMessage}{" "}
            <Text style={{ color: colors.primary }}>{lang.yes}</Text>.
          </Text>
          <View style={styles.popupBtnContainer}>
            <Button1
              text={lang.yes}
              backgroundColor={colors.primary}
              width="45%"
              onPress={() => {
                setShowPopup(false);
                // Show popup loading page immediately after clicking Yes
                setShowCheckInLoading(true);
                // Delay the actual check-in process slightly to allow UI to update
                setTimeout(() => {
                  handleCheckIn();
                }, 100);
              }}
            />
            <Button1
              text={lang.no}
              backgroundColor={colors.error_text}
              width="45%"
              onPress={() => setShowPopup(false)}
            />
          </View>
        </Popup>
        
        {/* ✅ Popup Loading Page - New implementation */}
        <Popup
          visible={showCheckInLoading}
          onClose={() => setShowCheckInLoading(false)}
          dismissOnOverlayPress={false}
          title={lang.processingCheckIn}
          titleStyle={{ color: colors.primary, textAlign: 'center' }}
        >
          <View style={styles.popupLoadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.popupLoadingText}>{lang.processingCheckIn}</Text>
          </View>
        </Popup>
        
        {/* ✅ Checkout Loading Page - New implementation */}
        <Popup
          visible={showCheckOutLoading}
          onClose={() => setShowCheckOutLoading(false)}
          dismissOnOverlayPress={false}
          title={lang.checkOut}
          titleStyle={{ color: colors.primary, textAlign: 'center' }}
        >
          <View style={styles.popupLoadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.popupLoadingText}>{lang.checkOut}</Text>
          </View>
        </Popup>
      </ScrollView>
      
      {/* ✅ Check-in Success Loading Page */}
      {showCheckInSuccessLoading && (
        <View style={styles.successLoadingPage}>
          <View style={styles.successLoadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.successLoadingText}>{lang.checkInSuccess}</Text>
            <Text style={styles.successLoadingSubtext}>{lang.redirecting}</Text>
          </View>
        </View>
      )}
      
      <Toast config={toastConfig} />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.secondary,
    alignItems: "center",
    paddingTop: 50,
    padding: 20,
  },
  date: {
    fontSize: fonts.size.m,
    color: colors.search,
    marginBottom: 5,
  },
  welcome: {
    fontSize: fonts.size.xxl,
    fontWeight: fonts.weight.bold,
    marginBottom: 50,
    textAlign: "center",
  },
  headingContainer: {
    flexDirection: "row",
    marginBottom: 8, // space between heading and CartBox
    alignSelf: "flex-start",
  },
  headingIcon: {
    width: 20,
    height: 20,
    marginRight: 8, // space between icon and text
  },
  headingText: {
    fontSize: fonts.size.m,
    fontWeight: "bold",
    color: colors.primary,
    marginBottom: 8, // space between heading and CartBox
  },
  addressContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 4, // small gap between lines
  },
  addressLine: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2, // tiny spacing
  },
  addressIcon: {
    width: 14,
    height: 14,
    marginRight: 6,
    resizeMode: "contain",
  },
  addressIcon1: {
    width: 16,
    height: 16,
    marginRight: 6,
    resizeMode: "contain",
  },
  addressText: {
    fontSize: fonts.size.m,
    color: colors.text,
    fontWeight: fonts.weight.regular,
  },
  middle: {
    alignItems: "center",
    marginBottom: 20,
    marginTop: 50,
  },
  icon: {
    width: 50,
    height: 50,
    marginBottom: 20,
    resizeMode: "contain",
  },
  subText: {
    fontSize: fonts.size.m,
    color: colors.subtext2,
  },
  checkinBtn: {
    width: "100%",
    borderRadius: 12,
  },
  statusRow: {
    width: "100%",
    alignSelf: "flex-start",
    alignItems: "flex-start",
    borderRadius: 10,
    marginTop: 30,
    backgroundColor: "#fff",
    flexDirection: "row",
    paddingBottom: 16,
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  infoBox: {
    width: "100%",
    padding: 15,
    borderRadius: 12,
    backgroundColor: "#f9f9f9",
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: fonts.size.l,
    color: colors.subtext2,
  },
  infoValue: {
    fontSize: fonts.size.l,
    fontWeight: fonts.weight.semibold,
    color: colors.text,
  },
  durationValue: {
    fontSize: fonts.size.l,
    fontWeight: fonts.weight.semibold,
    color: colors.primary,
  },
  popupText: {
    textAlign: "center",
    fontSize: fonts.size.s,
    marginBottom: 20,
  },
  popupBtnContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    marginTop: 10,
  },
  popupLoadingContainer: {
    alignItems: 'center',
    gap: 10,
  },
  popupLoadingText: {
    fontSize: fonts.size.m,
    color: colors.text,
    fontWeight: '500',
  },
  
  // ✅ New styles for check-in success loading page
  successLoadingPage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
  },
  successLoadingContainer: {
    backgroundColor: colors.secondary,
    borderRadius: 10,
    padding: 30,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: '80%',
  },
  successLoadingText: {
    marginTop: 15,
    fontSize: fonts.size.l,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  successLoadingSubtext: {
    marginTop: 10,
    fontSize: fonts.size.m,
    color: colors.subtext2,
    textAlign: 'center',
  },
});

export default C_Homescreen;
