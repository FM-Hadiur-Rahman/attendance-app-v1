import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";
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
  getTodaySchedule,
  getBranchDetails,
  getMyAttendanceHistory,
  isCheckedInToday,
  hasCompletedShiftToday,
  clearScheduleCache,
  getTodayScheduleNoCache  // ✅ Import the no-cache function
} from "../../../api/checkin_checkout";
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
// ✅ Main Component
const C_Homescreen: React.FC<HomeScreenProps> = ({
  userId,
  langId,
  setLangId,
}) => {
  // useNavigation with proper typing
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const [withinRange, setWithinRange] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCheckoutPopup, setShowCheckoutPopup] = useState(false);
  const [showCheckInLoading, setShowCheckInLoading] = useState(false); // ✅ New state for check-in loading
  const [showCheckOutLoading, setShowCheckOutLoading] = useState(false); // ✅ New state for check-out loading
  const [showCheckInSuccessLoading, setShowCheckInSuccessLoading] = useState(false); // ✅ New state for post check-in success loading
  const currentLang = langId || "en";
  const lang =
    translations[currentLang as keyof typeof translations] ||
    translations["en"];
  const [currentUser, setCurrentUser] = useState<ProfileUser | null>(null);
  // branchInfo will always contain a displayable string in `.address`
  const [branchInfo, setBranchInfo] = useState<{
    name?: string;
    address?: string;
    coordinates?: { latitude: number; longitude: number } | null;
    raw?: any;
  } | null>(null);
  // derive shop coords from branchInfo
  const SHOP_LAT = branchInfo?.coordinates?.latitude ?? 0;
  const SHOP_LON = branchInfo?.coordinates?.longitude ?? 0;
  const todayDate = new Date().toISOString().split("T")[0];
  const [loading, setLoading] = useState(true);
  const [todaySchedule, setTodaySchedule] = useState<any>(null);
  const hasSchedule = !!todaySchedule && !!todaySchedule.start_time;
  const [attendanceToday, setAttendanceToday] = useState<any | null>(null);
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
  const lastLocationCache = useRef<{location: any; timestamp: number} | null>(null);
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
    branchRawOrObj: any
  ): { lat?: number; lon?: number } | null => {
    if (!branchRawOrObj) return null;
    const candidates = [
      branchRawOrObj.location?.coordinates,
      branchRawOrObj.address?.coordinates,
      branchRawOrObj.raw?.location?.coordinates,
      branchRawOrObj.raw?.address?.coordinates,
      branchRawOrObj.coordinates,
    ];
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
  useEffect(() => {
    let mounted = true;
    const fetchAndResolve = async () => {
      const branchId =
        todaySchedule?.raw?.branch_id?._id ??
        todaySchedule?.branch?.rawBranch?._id ??
        todaySchedule?.branch_id?._id ??
        todaySchedule?.branch?.id ??
        null;
      if (!branchId) return;
      try {
        const branch = await getBranchDetails(branchId);
        if (!branch) return;
        const coords =
          extractLatLon(branch) ?? extractLatLon(branch.raw) ?? null;
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
            raw: branch.raw ?? branch,
          });
        }
      } catch (err) {
        console.error("❌ Error resolving branch address:", err);
        if (mounted) {
          setBranchInfo((prev: any) => ({
            ...(prev || {}),
            name: prev?.name ?? todaySchedule?.branch?.name ?? "Branch",
            address: prev?.address ?? "Address not available",
          }));
        }
      }
    };
    fetchAndResolve();
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
      setCanCheckIn(now >= earliestCheckInTime);
    }, 60000); // every 1 minute
    return () => clearInterval(interval);
  }, [todaySchedule]);
  const handleCheckInAttempt = () => {
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
      // ✅ Proper safe extraction of branch ID (NO more never)
      let branchId: string | undefined = undefined;
      if (currentUser?.branch) {
        if (typeof currentUser.branch === "string") {
          branchId = currentUser.branch;
        } else if (
          typeof currentUser.branch === "object" &&
          currentUser.branch !== null
        ) {
          // ✅ Type assertion to access _id safely
          branchId = (currentUser.branch as { _id?: string })?._id || undefined;
        }
      }
      console.log("🏷️ Using Branch ID:", branchId);
      console.log("👤 User ID:", userId);
      
      // ➡ Fetch schedule WITHOUT branchId filter to allow cross-branch schedules
      const resp = await getTodayScheduleNoCache({
        userId,
        // branchId, // ❌ Do NOT pass branchId - allows showing schedules for any branch assigned to user
        timezone: "Asia/Colombo",
      });
      const schedules = resp?.schedules ?? [];
      const rawToday = resp?.todaySchedule ?? null;
      console.log("📌 Today schedule response:", resp);
      console.log("📦 Total schedules fetched:", schedules.length);
      
      // ❌ If no today schedule found — stop
      if (!rawToday || !("start_time" in rawToday)) {
        console.log("❌ No valid today schedule. Setting null.");
        setTodaySchedule(null);
        setLoading(false);
        return;
      }
      
      // 🔍 Extract raw object
      const raw = "raw" in rawToday ? rawToday.raw : rawToday;
      // ⏱ Start & End times (safe)
      const start_time =
        rawToday.start_time ?? raw.start_time ?? raw.start ?? "";
      const end_time = rawToday.end_time ?? raw.end_time ?? raw.end ?? "";
      // ⏳ Duration calculation
      let duration = typeof raw.duration === "number" ? raw.duration : 0;
      if (start_time && end_time && !duration) {
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
      // 🏢 Branch info
      const branchName =
        rawToday.branchname ?? raw.branch_id?.name ?? raw.branch?.name ?? null;
      const branchAddress = raw.branch_id?.address ?? raw.branch?.address ?? "";
      // 📦 Final Schedule Object
      const scheduleObj = {
        start_time,
        end_time,
        duration,
        date: raw.date ?? new Date().toISOString().split("T")[0],
        branch: branchName
          ? {
              name: branchName,
              address: branchAddress,
              rawBranch: raw.branch_id ?? raw.branch ?? null,
            }
          : null,
        raw,
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
      // Simplified logic: just check the attendance status
      const isCheckedIn = await isCheckedInToday();
      const isShiftCompleted = await hasCompletedShiftToday();
      
      if (isShiftCompleted) {
        setAttendanceStatus('shift_completed');
      } else if (isCheckedIn) {
        setAttendanceStatus('checked_in');
      } else {
        setAttendanceStatus('not_checked_in');
      }
      
      // Keep the existing detailed logic for displaying check-in/check-out times
      const todayRecords = await getMyAttendanceHistory();
      console.log("📌 Today Records from Helper:", todayRecords.length);
      console.log("📌 Today Records from Helper records:", todayRecords);
      
      if (!todayRecords || todayRecords.length === 0) {
        // no attendance today
        setAttendanceToday(null);
        setCheckInTime(null);
        setCheckOutTime(null);
        setDuration("0h 0m");
        return;
      }
      
      // pick latest record by In
      todayRecords.sort(
        (a, b) => moment(b.In).valueOf() - moment(a.In).valueOf()
      );
      const rec = todayRecords[0];
      setAttendanceToday(rec);
      const hasIn = !!rec?.In;
      const hasOut = !!rec?.Out;
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
      // 🔥 canCheckOut logic: use shift end time (primary, ignore duration for now)
      let allowedToCheckOut = false;
      if (hasIn && !hasOut && inMoment && todaySchedule?.end_time) {
        const [eh, em] = todaySchedule.end_time.split(":").map(Number);
        let shiftEndMoment = inMoment
          .clone()
          .set({ hour: eh, minute: em, second: 0 });
        if (shiftEndMoment.isBefore(inMoment)) shiftEndMoment.add(1, "day");
        allowedToCheckOut = now.isSameOrAfter(shiftEndMoment);
      }
      setCanCheckOut(allowedToCheckOut);
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

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("❌ Location permission denied");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      
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
    }
  };
  const reloadAll = async () => {
    // ✅ Smart reload: Only fetch data if needed
    try {
      // Always refresh location
      await refreshLocation();
      
      // ✅ Always fetch schedule (needed for UI display)
      await loadTodaySchedule();
      
      // Only fetch attendance if not checked out for the day
      if (attendanceStatus !== 'shift_completed') {
        await fetchAttendance();
      }
    } catch (error) {
      console.error("❌ Error in smart reload:", error);
    }
  };
  // ✅ Overall Auto Refresh: Reduced interval to 5 minutes to decrease API load
  useEffect(() => {
    reloadAll();
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
    fetchProfile();
  }, []);
  
  // ✅ Clear schedule cache on component mount for debugging
  useEffect(() => {
    clearScheduleCache();
  }, []);
  
  useEffect(() => {
    console.log("📌 todaySchedule updated:", todaySchedule);
  }, [todaySchedule]);
  useEffect(() => {
    if (!checkedIn || !checkInTime || checkOutTime || !todaySchedule?.end_time) return;
    const inMoment = moment(checkInTime, "HH:mm");
    const [eh, em] = todaySchedule.end_time.split(":").map(Number);
    let allowed = inMoment.clone().set({ hour: eh, minute: em, second: 0 });
    if (allowed.isBefore(inMoment)) allowed.add(1, "day");
    const timer = setInterval(() => {
      setCanCheckOut(moment().isSameOrAfter(allowed));
    }, 1000);
    return () => clearInterval(timer);
  }, [checkedIn, checkInTime, todaySchedule]);
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
      todaySchedule?.raw?.branch_id?._id ??
      todaySchedule?.branch?.rawBranch?._id ??
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
    
    // ✅ Check if current time is past the scheduled end time
    const tzDate =
      todaySchedule.date?.split("T")[0] ??
      new Date().toISOString().split("T")[0];
  
    try {
      // Create schedule end datetime with proper date
      let scheduleEndDateTime = new Date(
        `${tzDate}T${todaySchedule.end_time}`
      );
      
      // Create schedule start datetime for reference
      let scheduleStartDateTime = new Date(
        `${tzDate}T${todaySchedule.start_time}`
      );
      
      // If the times don't include seconds, add ":00" to make valid ISO strings
      if (!todaySchedule.end_time.includes(":") || todaySchedule.end_time.split(":").length < 3) {
        const endTimeParts = todaySchedule.end_time.split(":");
        if (endTimeParts.length === 2) {
          scheduleEndDateTime = new Date(`${tzDate}T${todaySchedule.end_time}:00`);
        }
      }
      
      if (!todaySchedule.start_time.includes(":") || todaySchedule.start_time.split(":").length < 3) {
        const startTimeParts = todaySchedule.start_time.split(":");
        if (startTimeParts.length === 2) {
          scheduleStartDateTime = new Date(`${tzDate}T${todaySchedule.start_time}:00`);
        }
      }
      
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
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setShowCheckInLoading(false);
        showErrorToast("Location permission denied.");
        return;
      }
      
      const loc = await Location.getCurrentPositionAsync({});
      
      const branchId = getBranchIdFromSchedule();
      if (!branchId) {
        setShowCheckInLoading(false);
        showErrorToast("Branch ID not available.");
        return;
      }
      
      const payload = {
        latitude: loc.coords.latitude.toString(),
        longitude: loc.coords.longitude.toString(),
        branchId,
      };
      
      // Show loading immediately
      setShowCheckInLoading(true);
      
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
        }
        
        // ✅ Show post check-in success loading page
        setShowCheckInSuccessLoading(true);
        
        // ✅ Small delay to show the success loading page before refreshing
        setTimeout(() => {
          setShowCheckInSuccessLoading(false);
        }, 100);
      } else {
        setShowCheckInLoading(false);
        showErrorToast(lang.Check_in_failed);
      }
    } catch (error: any) {
      setShowCheckInLoading(false); // ✅ Hide loading overlay on error
      setShowCheckInSuccessLoading(false); // ✅ Hide success loading on error
      console.error("Check-in error:", error);
      
      // Show only backend errors
      showErrorToast(error.response?.data?.message || lang.Check_in_failed);
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
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setShowCheckOutLoading(false);
        showErrorToast("Location permission denied.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const branchId = getBranchIdFromSchedule();
      if (!branchId) {
        setShowCheckOutLoading(false);
        showErrorToast("Branch ID not available.");
        return;
      }
      const payload = {
        latitude: loc.coords.latitude.toString(),
        longitude: loc.coords.longitude.toString(),
        branchId,
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
        }
      } else {
        setShowCheckOutLoading(false);
        showErrorToast(lang.Check_out_failed);
      }
    } catch (error: any) {
      setShowCheckOutLoading(false); // ✅ Hide loading overlay on error
      console.error("Check-out error:", error);
      showErrorToast(error.response?.data?.message || lang.Check_out_failed);
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
        const loc = await Location.getCurrentPositionAsync({});
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
      checkDistance();
    }
    return () => clearTimeout(timer);
  }, [SHOP_LAT, SHOP_LON]);
  const formatTo12Hour = (time?: string): string => {
    if (!time) return "";
    const [hour, minute] = time.split(":");
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${minute} ${ampm}`;
  };
  const onRefresh = async () => {
    setRefreshing(true);
    // ✅ Force a full reload when user manually refreshes
    // ✅ Clear cache to ensure fresh data
    clearScheduleCache();
    await Promise.all([loadTodaySchedule(), refreshLocation(), fetchAttendance()]);
    setRefreshing(false);
  };
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
                todaySchedule && branchInfo && withinRange && canCheckIn
                  ? colors.primary
                  : colors.button_background
              }
              textStyle={{
                color:
                  todaySchedule && branchInfo && withinRange && canCheckIn
                    ? colors.button_background
                    : colors.subtext2,
              }}
              containerStyle={styles.checkinBtn}
            />
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
                    handleCheckOut();
                  }, 100);
                }}
              />
            )}
            <Popup
              visible={showCheckoutPopup}
              onClose={() => setShowCheckoutPopup(false)}
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

export default C_Homescreen;

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
