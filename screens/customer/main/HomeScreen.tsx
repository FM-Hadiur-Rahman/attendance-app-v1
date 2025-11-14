// screens/customer/main/HomeScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  RefreshControl,
} from "react-native";
import * as Location from "expo-location";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import { Button1 } from "../../../components/Button";
import Popup from "../../../components/Popup";
import { User, users } from "../../../api/dummyapi/Users";
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json";
import { workHours, WorkHour, } from "../../../api/dummyapi/WorkHours";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../components/Toast";
import CartBox from "../../../components/CartBox";
import { branches, getBranchById } from "../../../api/dummyapi/Branch";
import { Schedule, schedules } from "../../../api/dummyapi/Schedule";
import { useNavigation } from "@react-navigation/native";
import { getProfile, ProfileUser } from '../../../api/profile';
import { startAttendance, endAttendance, getTodaySchedule, getBranchDetails } from '../../../api/checkin_checkout';

// Props type
interface HomeScreenProps {
  userId: string;
  langId: string;
  setLangId: (lang: string) => void;
}

const C_Homescreen: React.FC<HomeScreenProps> = ({ userId, langId, setLangId }) => {
  const [withinRange, setWithinRange] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCheckoutPopup, setShowCheckoutPopup] = useState(false);
  const currentLang = langId || "en";
  const lang = translations[currentLang];
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [duration, setDuration] = useState<string>("0h 0m");
  const [currentUser, setCurrentUser] = useState<ProfileUser | null>(null);
  const userBranchObj = currentUser ? getBranchById(currentUser.branch_id) : null;
  const SHOP_LAT = userBranchObj?.location.latitude || 0;
  const SHOP_LON = userBranchObj?.location.longitude || 0;
  const [branchAddress, setBranchAddress] = useState<string | null>(null);
  const navigation = useNavigation();
  const [canCheckOut, setCanCheckOut] = useState(false);
  const [checkedOut, setCheckedOut] = useState(false);
  const todayDate = new Date().toISOString().split("T")[0];
  const [loading, setLoading] = useState(true);
  const [todaySchedule, setTodaySchedule] = useState<any>(null);

  // branchInfo will always contain a displayable string in `.address`
  const [branchInfo, setBranchInfo] = useState<{
    name?: string;
    address?: string;
    coordinates?: { latitude: number; longitude: number } | null;
    raw?: any;
  } | null>(null);

  const [allSchedules, setAllSchedules] = useState<any[]>([]); // for all fetched schedules

  const CHECKIN_RADIUS = 8912970.088506764; // keep radius same (meters)

  let nextSchedule: Schedule | undefined = undefined;

  if (!todaySchedule) {
    nextSchedule = schedules
      .filter(s => s.user_id === userId && new Date(s.date) > new Date(todayDate))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  }
useEffect(() => {
    let mounted = true;

    const loadSchedule = async () => {
      try {
        const branchId = currentUser?.branch_id;
        const { schedules, todaySchedule } = await getTodaySchedule({
          userId,
          branchId,
          timezone: "Asia/Colombo",
        });

        if (!mounted) return;

        console.log("📌 Today schedule:", todaySchedule);
        console.log("📦 Total schedules fetched:", schedules.length);

        setTodaySchedule(todaySchedule ?? null);
        setAllSchedules(schedules);
      } catch (err) {
        console.error("❌ Failed to load schedule:", err);
        if (mounted) setTodaySchedule(null);
      }
    };

    loadSchedule();
    return () => { mounted = false; };
  }, [userId, currentUser?.branch_id]);

// பதிலாக இந்த useEffect-ஐ paste பண்ணுங்கள் (replace the old one)
useEffect(() => {
  let mounted = true;

  const tryReverseGeocode = async (lat: number, lon: number) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        // permission denied -> fallback to coords string
        return `Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}`;
      }

      // primary attempt
      const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
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

      // If no result, return null to signal caller to try swap
      return null;
    } catch (err) {
      console.warn("❌ reverseGeocode failed:", err);
      return null;
    }
  };

  const extractLatLon = (branchRawOrObj: any): { lat?: number; lon?: number } | null => {
    if (!branchRawOrObj) return null;

    // Common places to look for coordinates
    const candidates = [
      branchRawOrObj.location?.coordinates,
      branchRawOrObj.address?.coordinates,
      branchRawOrObj.raw?.location?.coordinates,
      branchRawOrObj.raw?.address?.coordinates,
      branchRawOrObj.coordinates,
    ];

    for (const c of candidates) {
      if (Array.isArray(c) && c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number") {
        // c often is [lon, lat] (GeoJSON). But sometimes [lat, lon]
        const a = c[0], b = c[1];
        // Heuristic detection:
        // latitude must be between -90 and 90, longitude between -180 and 180.
        // If a is in lat-range and b in lon-range => assume [lat, lon]
        if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
          // a could be lat (but could also be lon if lon in [-90,90] like some coords)
          // We'll prefer GeoJSON standard [lon, lat], so check which makes more geographic sense:
          // check two possibilities:
          const latIfA = a, lonIfA = b;
          const latIfB = b, lonIfB = a;
          // prefer the pair where lat is within typical lat bounds and lon within typical lon bounds
          if (Math.abs(latIfA) <= 90 && Math.abs(lonIfA) <= 180 && Math.abs(latIfB) <= 90 && Math.abs(lonIfB) <= 180) {
            // both plausible; choose GeoJSON [lon,lat] as default => treat as [lon,lat]
            return { lat: b, lon: a };
          }
        }
        // fallback: treat as [lon, lat] (most APIs use this)
        return { lat: c[1], lon: c[0] };
      }
    }
    return null;
  };

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

      // extract coordinates from branch (supports many shapes)
      const coords = extractLatLon(branch) ?? extractLatLon(branch.raw) ?? null;

      let resolvedAddress: string | null = null;
      let finalLat: number | undefined;
      let finalLon: number | undefined;

      // If API already returned a string address, prefer that initially
      if (typeof branch.address === "string" && branch.address.trim().length > 0) {
        resolvedAddress = branch.address;
      }

      if (coords) {
        finalLat = coords.lat;
        finalLon = coords.lon;

        // try reverse geocode with this order
        const firstTry = await tryReverseGeocode(finalLat, finalLon);
        if (firstTry) {
          resolvedAddress = firstTry;
        } else {
          // attempt swap (some sources store [lat, lon])
          const swappedTry = await tryReverseGeocode(finalLon, finalLat);
          if (swappedTry) {
            // if swapped worked, swap our final coords to match
            resolvedAddress = swappedTry;
            const tmp = finalLat; finalLat = finalLon; finalLon = tmp;
          }
        }
      }

      // final fallback -> show coords string if no human address
      if (!resolvedAddress && typeof finalLat === "number" && typeof finalLon === "number") {
        resolvedAddress = `Lat: ${finalLat.toFixed(6)}, Lon: ${finalLon.toFixed(6)}`;
      }

      if (!resolvedAddress) {
        // final fallback: use branch.name or "Address not available"
        resolvedAddress = branch.name ?? "Address not available";
      }

      // set a normalized branchInfo that UI can safely render
      if (mounted) {
        setBranchInfo({
          name: branch.name ?? branch.id ?? "Branch",
          address: resolvedAddress,
          // keep coordinates if we successfully found them
          coordinates: (typeof finalLat === "number" && typeof finalLon === "number")
            ? { latitude: finalLat, longitude: finalLon }
            : null,
          raw: branch.raw ?? branch,
        });
        console.log("✅ branchInfo updated:", { id: branch.id ?? branch._id, name: branch.name, address: resolvedAddress });
      }
    } catch (err) {
      console.error("❌ Error resolving branch address:", err);
      if (mounted) {
        // ensure branchInfo at least contains name
        setBranchInfo((prev: any) => ({
          ...(prev || {}),
          name: prev?.name ?? (todaySchedule?.branch?.name ?? "Branch"),
          address: prev?.address ?? "Address not available",
        }));
      }
    }
  };

  fetchAndResolve();

  return () => {
    mounted = false;
  };
}, [todaySchedule, getBranchDetails /* keep lint happy if needed */]);


  //console.log("Next available schedule:", todaySchedule);
  useEffect(() => {
    if (todaySchedule?.raw?.branch_id?._id) {
      getBranchDetails(todaySchedule.raw.branch_id._id)
        .then((branch) => {
          if (branch) setBranchInfo(branch);
        })
        .catch((err) => console.error("❌ Branch info fetch failed:", err));
    }
  }, [todaySchedule]);

  useEffect(() => {
    let mounted = true;

    const loadSchedule = async () => {
      try {
        const branchId = currentUser?.branch_id;
        const { schedules, todaySchedule } = await getTodaySchedule({
          userId,
          branchId,
          timezone: "Asia/Colombo",
        });

        if (!mounted) return;

        console.log("📌 Today schedule:", todaySchedule);
        console.log("📦 Total schedules fetched:", schedules.length);

        setTodaySchedule(todaySchedule ?? null);  // <-- your state setter
        setAllSchedules(schedules);               // <-- optional: keep all schedules
      } catch (err) {
        console.error("❌ Failed to load schedule:", err);
        if (mounted) setTodaySchedule(null);
      }
    };

    loadSchedule();
    return () => { mounted = false };
  }, [userId, currentUser?.branch_id]);



  // 🔹 Optional helper to check and show toast
  const handleCheckInAttempt = () => {
    if (!todaySchedule) return;

    const tzDate = todaySchedule.date?.split("T")[0] ?? new Date().toISOString().split("T")[0];
    const scheduleDateTime = new Date(`${tzDate}T${todaySchedule.start_time}:00`);
    const earliestCheckInTime = new Date(scheduleDateTime.getTime() - 15 * 60 * 1000);

    const now = new Date();
    if (now < earliestCheckInTime) {
      showErrorToast(`⚠️ You can only check in 15 minutes before ${todaySchedule.start_time}`);
      return false;
    }
    return true;
  };

  // replace your existing loadTodaySchedule useEffect with this exact code
  useEffect(() => {
    let mounted = true;

    const loadTodaySchedule = async () => {
      try {
        setLoading(true);

        // pass branchId if available (reduces results)
        const branchId = currentUser?.branch_id;

        // CALL the helper INSIDE async function (no top-level await)
        const resp = await getTodaySchedule({ userId, branchId, timezone: "Asia/Colombo" });

        // handle shape where helper returns either { schedules, todaySchedule } or just todaySchedule
        const schedules = resp?.schedules ?? [];
        const rawToday = resp?.todaySchedule ?? resp ?? null;

        console.log("📌 HomeScreen getTodaySchedule resp:", resp);

        if (!mounted) return;

        if (!rawToday) {
          setTodaySchedule(null);
          setBranchInfo(null);
          return;
        }

        // rawToday may already be normalized by helper (branchname/start_time/end_time)
        const raw = rawToday.raw ?? rawToday;
        const start_time = rawToday.start_time ?? raw.start_time ?? raw.start ?? "";
        const end_time = rawToday.end_time ?? raw.end_time ?? raw.end ?? "";
        let duration = typeof raw.duration === "number" ? raw.duration : 0;

        // compute duration from start/end if needed
        if (start_time && end_time && !duration) {
          try {
            const [sh = "0", sm = "0"] = String(start_time).split(":");
            const [eh = "0", em = "0"] = String(end_time).split(":");
            const sD = new Date(); sD.setHours(Number(sh), Number(sm), 0, 0);
            const eD = new Date(); eD.setHours(Number(eh), Number(em), 0, 0);
            if (eD.getTime() < sD.getTime()) eD.setDate(eD.getDate() + 1);
            duration = (eD.getTime() - sD.getTime()) / (1000 * 60 * 60);
          } catch (e) {
            // ignore
          }
        }

        const scheduleObj = {
          start_time,
          end_time,
          duration,
          date: raw.date ?? new Date().toISOString().split("T")[0],
          branch: {
            name: rawToday.branchname ?? raw.branch_id?.name ?? raw.branch?.name ?? "No Branch",
            address: raw.branch_id?.address ?? raw.branch?.address ?? "",
            rawBranch: raw.branch_id ?? raw.branch ?? null,
          },
          raw,
        };

        setTodaySchedule(scheduleObj);
        setBranchInfo({
          name: scheduleObj.branch.name,
          address: scheduleObj.branch.address,
        });
      } catch (err) {
        console.error("❌ Error loading today's schedule (HomeScreen):", err);
        if (mounted) {
          setTodaySchedule(null);
          setBranchInfo(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // run loader once (and when deps change)
    loadTodaySchedule();

    // optional polling: refresh every 5 minutes
    const interval = setInterval(loadTodaySchedule, 1000 * 60 * 5);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [userId, currentUser?.branch_id]);


  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const user = await getProfile();
        setCurrentUser(user);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);


  // useEffect(() => {
  //   if (!checkInTime || !todaySchedule) return;

  //   const startTime = new Date(checkInTime);
  //   const endTime = new Date(startTime.getTime() + todaySchedule.duration * 60 * 60 * 1000);

  //   const interval = setInterval(() => {
  //     const now = new Date();
  //     setCanCheckOut(now >= endTime);
  //   }, 1000);

  //   return () => clearInterval(interval);
  // }, [checkInTime, todaySchedule]);


  useEffect(() => {
    if (!checkInTime || checkOutTime) return;

    const interval = setInterval(() => {
      const now = new Date();
      const startTime = parseTimeStringToDate(checkInTime);
      const diffMs = now.getTime() - startTime.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      setDuration(`${diffHours}h ${diffMinutes}m`);
    }, 60000); // update every minute

    return () => clearInterval(interval);
  }, [checkInTime, checkOutTime]);


  useEffect(() => {
    if (!checkedIn || !checkInTime || !todaySchedule) return;

    const [h, m, s] = checkInTime
      .replace(/[^0-9:]/g, "")
      .split(":")
      .map(Number);

    const checkInDate = new Date();
    checkInDate.setHours(h, m, s || 0, 0);

    // ⏰ Duration in milliseconds + 1 minute buffer
    const durationMs = todaySchedule.duration * 60 * 60 * 1000 + 60 * 1000;
    const allowedCheckoutTime = new Date(checkInDate.getTime() + durationMs);

    const timer = setInterval(() => {
      const now = new Date();
      setCanCheckOut(now >= allowedCheckoutTime);
    }, 1000);

    return () => clearInterval(timer);
  }, [checkedIn, checkInTime, todaySchedule]);


  // 🔧 Convert HH:MM:SS or locale time to 12h format like "02:30 PM"
  // 🕒 Format time as "hh:mm AM/PM" (no seconds)
  const formatDisplayTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatTime12h = (date: Date) => {
    // Return time like "02:30 PM" or "2:30 PM" depending on locale; consistent 12-hour format with minutes
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Utility function to safely parse time string into Date
  // Accepts: "HH:MM:SS", "HH:MM", "hh:mm:ss AM/PM", "hh:mm AM/PM"
  const parseTimeStringToDate = (timeStr?: string | Date) => {
    const d = new Date();
    if (!timeStr) return d;

    if (timeStr instanceof Date) return timeStr;

    const trimmed = String(timeStr).trim();
    const lower = trimmed.toLowerCase();

    // AM/PM format
    if (lower.includes("am") || lower.includes("pm")) {
      const parts = trimmed.split(" ");
      const timePart = parts[0];
      const modifier = parts[1];
      const [hStr, mStr, sStr] = timePart.split(":");
      let hours = parseInt(hStr || "0", 10);
      const minutes = parseInt(mStr || "0", 10);
      const seconds = parseInt(sStr || "0", 10);
      if (modifier?.toLowerCase() === "pm" && hours < 12) hours += 12;
      if (modifier?.toLowerCase() === "am" && hours === 12) hours = 0;
      d.setHours(hours, minutes, seconds || 0, 0);
      return d;
    }

    // Fallback for "HH:MM:SS" or "HH:MM"
    const [h = 0, m = 0, s = 0] = trimmed.split(":").map(Number);
    d.setHours(h || 0, m || 0, s || 0, 0);
    return d;
  };



  // 🧮 Given checkInTime + duration, calculate end time
  const getActualEndTime = (checkInTime: string, duration: number) => {
    const now = new Date();

    // Parse checkInTime (works for both 12h or 24h strings)
    let h = 0, m = 0, s = 0;
    const timeStr = checkInTime.replace(/[^0-9:]/g, "");
    [h, m, s] = timeStr.split(":").map(Number);
    now.setHours(h, m, s || 0, 0);

    // Add duration (in hours → milliseconds)
    const endTime = new Date(now.getTime() + duration * 60 * 60 * 1000);
    return formatDisplayTime(endTime);
  };

  const addWorkHour = (userId: string, checkInTime: Date): WorkHour => {
    const newId = `WH${(workHours.length + 1).toString().padStart(3, "0")}`;
    const formattedTime = checkInTime.toTimeString().split(" ")[0];
    const formattedDate = checkInTime.toISOString().split("T")[0];

    const newRecord: WorkHour = {
      id: newId,
      user_id: userId,
      check_in: formattedTime,
      check_out: "",
      date: formattedDate,
      createDate: checkInTime.toISOString(),
      updateDate: checkInTime.toISOString(),
    };

    workHours.push(newRecord);
    return newRecord;
  };

  const updateWorkHour = (userId: string, checkOutTime: Date): WorkHour | null => {
    const record = [...workHours].reverse().find(w => w.user_id === userId && !w.check_out);

    if (!record) {
      console.warn("⚠️ No active work record found for check-out.");
      return null;
    }

    const formattedTime = checkOutTime.toTimeString().split(" ")[0];
    record.check_out = formattedTime;
    record.updateDate = checkOutTime.toISOString();
    return record;
  };

  useEffect(() => {
    const fetchBranchAddress = async () => {
      const branchId = todaySchedule?.branch?.rawBranch?._id;
      if (!branchId) return;

      try {
        const branch = await getBranchDetails(branchId); // API call

        if (!branch?.location?.coordinates) return;

        const [longitude, latitude] = branch.location.coordinates; // GeoJSON format

        // Permission
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        const result = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (result.length > 0) {
          const place = result[0];
          const formatted = `${place.name ? place.name + ", " : ""}${place.street ? place.street + ", " : ""}${place.city || ""}${place.region ? ", " + place.region : ""}${place.postalCode ? ", " + place.postalCode : ""}${place.country ? ", " + place.country : ""}`;

          setBranchInfo({
            name: branch.name,
            address: formatted,
          });
          console.log("✅ Branch address:", formatted);
        }
      } catch (err) {
        console.log("❌ Error fetching branch address:", err);
      }
    };

    fetchBranchAddress();
  }, [todaySchedule]);

  useEffect(() => {
    const user = users.find(u => u.id === userId);
    if (user) setCurrentUser(user);
  }, [userId]);

  const [shopAddress, setShopAddress] = useState<string | null>(null); // ✅ new state
  const displayBranchAddress = () => {
    if (!branchInfo) return "No branch address";
    if (typeof branchInfo.address === "string") return branchInfo.address;
    // fallback when address somehow still not a string
    if (branchInfo.coordinates) {
      return `Lat: ${branchInfo.coordinates.latitude.toFixed(6)}, Lon: ${branchInfo.coordinates.longitude.toFixed(6)}`;
    }
    return "Address not available";
  };

  const today = new Date().toLocaleDateString(langId === "de" ? "de-DE" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  // const today = new Date().toLocaleDateString(langId === "de" ? "de-DE" : "en-US", {
  //   weekday: "long",
  //   month: "long",
  //   day: "numeric",
  //   year: "numeric",
  // });
  const [todayRecord, setTodayRecord] = useState<WorkHour | null>(null);

  const employees = users.filter(user => user.role === "employee");
  // Get the branch name dynamically using getBranchById
  const userBranch = currentUser
    ? getBranchById(currentUser.branch_id)?.name || "No Branch"
    : "No Branch";

  const formatTime = (time: string | Date | null) => {
    if (!time) return "--:--";
    if (time instanceof Date) return formatTime12h(time);
    const s = String(time);
    if (s.toLowerCase().includes("am") || s.toLowerCase().includes("pm")) return s;
    return formatTime12h(parseTimeStringToDate(s));
  };

  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    // Start ticking only when user is checked in (or you can always tick if preferred)
    if (!checkedIn) return; // comment out this guard if you want continuous ticking always
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [checkedIn]);


  useEffect(() => {
    const user = users.find((u) => u.id === userId);
    if (user) setCurrentUser(user);
  }, [userId]);

  const handleCheckIn = async () => {

    handleCheckInAttempt(); // shows toast if too early

    if (!todaySchedule) {
      showErrorToast(lang.noScheduleToday);
      return;
    }

    try {
      // Request location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showErrorToast("Location permission denied.");
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const payload = {
        latitude: loc.coords.latitude.toString(),
        longitude: loc.coords.longitude.toString(),
        branch: todaySchedule.branchname || "Unknown Branch", // Include branch info
      };

      await startAttendance(payload); // Call API

      const now = new Date();
      const inTime = formatTime12h(now);

      // Update state
      setCheckedIn(true);
      setCanCheckOut(true); // allow checkout after check-in
      setCheckInTime(inTime);
      setCheckOutTime(null);
      setDuration("--");

      // Save work hour locally
      const saved = addWorkHour(userId, now);
      setTodayRecord(saved);

      showSuccessToast(lang.checkInSuccess);

    } catch (error: any) {
      showErrorToast(error.response?.data?.message || "Check-in failed.");
    }
  };

  const handleCheckOut = async () => {
    if (!checkInTime) {
      showErrorToast(lang.notCheckedIn);
      return;
    }

    if (!todaySchedule) {
      showErrorToast(lang.genericNoSchedule);
      return;
    }

    const now = new Date();

    // Parse schedule start/end times
    const [startHour, startMin] = (todaySchedule.start_time || "00:00").split(":").map(Number);
    const [endHour, endMin] = (todaySchedule.end_time || "23:59").split(":").map(Number);

    const scheduleStart = new Date(now);
    scheduleStart.setHours(startHour, startMin, 0, 0);

    const scheduleEnd = new Date(now);
    scheduleEnd.setHours(endHour, endMin, 0, 0);

    // Parse check-in time
    const checkInDate = parseTimeStringToDate(checkInTime);

    if (now < scheduleStart) {
      showErrorToast(`You can only check out after ${todaySchedule.start_time}`);
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showErrorToast("Location permission denied.");
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const payload = {
        latitude: loc.coords.latitude.toString(),
        longitude: loc.coords.longitude.toString(),
        branch: todaySchedule.branch.name || "Unknown Branch",
      };
      await endAttendance(payload);

      const checkOutStr = formatTime12h(now);
      // Calculate duration from check-in
      let diffMs = now.getTime() - checkInDate.getTime();
      if (diffMs < 0) diffMs = 0;

      const diffMinutes = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMinutes / 60);
      const remainingMinutes = diffMinutes % 60;
      const durationStr = `${diffHours > 0 ? diffHours + "h " : ""}${remainingMinutes}m`;

      // Update state
      setCheckOutTime(checkOutStr);
      setDuration(durationStr);
      setCheckedOut(true);
      setCanCheckOut(false);
      setShowPopup(false);

      const updated = updateWorkHour(userId, now);
      if (updated) setTodayRecord(updated);

      showSuccessToast(lang.checkOutSuccess);

    } catch (error: any) {
      showErrorToast(error.response?.data?.message || "Check-out failed.");
    }
  };

  useEffect(() => {
    const getShopAddress = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.log("❌ Location permission denied for reverse geocode");
          return;
        }

        const result = await Location.reverseGeocodeAsync({
          latitude: SHOP_LAT,
          longitude: SHOP_LON,
        });

        if (result.length > 0) {
          const place = result[0];
          const formatted = `${place.name ? place.name + ", " : ""}${place.street ? place.street + ", " : ""}${place.city || ""}`;
          setShopAddress(formatted);
          console.log("✅ Shop address:", formatted);
        }
      } catch (error) {
        console.log("❌ Error getting shop address:", error);
      }
    };

    getShopAddress();
  }, []);

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
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
        console.log("📏 latiitud:", loc);

        if (distance <= CHECKIN_RADIUS) {
          setWithinRange(true);

          clearTimeout(timer);
          timer = setTimeout(() => {
            setWithinRange(false);
          }, 60000);
        } else {
          setWithinRange(false);
        }
      } catch (error) {
        console.log("❌ Error getting location:", error);
      }
    };

    checkDistance();
    const interval = setInterval(checkDistance, 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("❌ Permission denied");
        setRefreshing(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const newDistance = getDistance(
        loc.coords.latitude,
        loc.coords.longitude,
        SHOP_LAT,
        SHOP_LON
      );

      setDistance(newDistance);
      console.log("📏 Distance after pull refresh:", newDistance.toFixed(2), "meters");

      if (newDistance <= CHECKIN_RADIUS) {
        setWithinRange(true);
      } else {
        setWithinRange(false);
      }
    } catch (error) {
      console.log("❌ Error getting location on refresh:", error);
    }

    setRefreshing(false);
  };

  const getEndTime = (startTime: string, durationHours: number) => {
    if (!startTime || !durationHours) return "--:--";

    const [hour, minute, second] = startTime.split(":").map(Number);
    const startDate = new Date();
    startDate.setHours(hour, minute, second || 0);

    const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

    const endHour = endDate.getHours();
    const endMinute = endDate.getMinutes();
    const ampm = endHour >= 12 ? "PM" : "AM";
    const hour12 = endHour % 12 === 0 ? 12 : endHour % 12;

    return `${hour12.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")} ${ampm}`;
  };


  const parse12hToDate = (timeStr?: string | null): Date | null => {
    if (!timeStr) return null;
    const s = String(timeStr).trim();

    // Matches: "2:30 PM", "02:30:12 AM", "14:30", "14:30:00"
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
    d.setHours(isNaN(hours) ? 0 : hours, isNaN(minutes) ? 0 : minutes, isNaN(seconds) ? 0 : seconds, 0);
    return d;
  };

  const calculateDuration = (checkInTime: string | null, checkOutTime: string | null) => {
    // always return a safe "Xh Ym" string
    if (!checkInTime) return "0h 0m";

    const start = parse12hToDate(checkInTime);
    if (!start) return "0h 0m";

    let end: Date | null = null;
    if (checkOutTime) {
      end = parse12hToDate(checkOutTime) || new Date();
    } else {
      end = new Date();
    }

    // if end before start → assume next day
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
    }, 1000); // update every second

    return () => clearInterval(interval);
  }, [checkedIn, checkInTime, checkOutTime]);
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const record = [...workHours].reverse().find(
      (w) => w.user_id === userId && w.date === today
    );
    if (record) {
      setTodayRecord(record);
      setCheckedIn(!!record.check_in && !record.check_out);
      setCheckInTime(record.check_in || null);
      setCheckOutTime(record.check_out || null);

      if (record.check_in && record.check_out) {
        setDuration(calculateDuration(record.check_in, record.check_out));
      }
    } else {
      // no record for today → reset
      setTodayRecord(null);
      setCheckedIn(false);
      setCheckInTime(null);
      setCheckOutTime(null);
      setDuration("--");
    }
  }, [userId]);
  useEffect(() => {
    const interval = setInterval(() => {
      const today = new Date().toISOString().split("T")[0];
      if (todayRecord && todayRecord.date !== today) {
        // midnight passed → reset UI
        setTodayRecord(null);
        setCheckedIn(false);
        setCheckInTime(null);
        setCheckOutTime(null);
        setDuration("--");
      }
    }, 60000); // check every 1 min

    return () => clearInterval(interval);
  }, [todayRecord]);

  return (
    <>
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
            // Navigate to NotificationScreen and pass userId & langId
            navigation.navigate("C_NotificationScreen" as any, {
              userId: userId, // current logged-in user
              langId: langId || "en", // current language
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
        <Text style={styles.welcome}>
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

        {(branchInfo || shopAddress || todaySchedule) && (
          <CartBox
            backgroundColor="#F1F2F4"
            borderRadius={12}
            width={"100%"}
            borderWidth={1}
            alignItems='flex-start'
            paddingTop={10}
            paddingBottom={10}
            paddingLeft={10}
          >
            <View style={styles.addressContainer}>
              {(branchInfo?.name || todaySchedule?.branch?.name) && (
                <View style={styles.addressLine}>
                  <Image source={require("../../../assets/icons/branch.png")} style={styles.addressIcon1} />
                  <Text style={styles.addressText}>
                    {branchInfo?.name ?? todaySchedule?.branch?.name}
                  </Text>
                </View>
              )}

              {/* Safe rendering: use displayBranchAddress() which returns a string */}
              {(branchInfo?.address || todaySchedule?.branch?.address) && (
                <View style={styles.addressLine}>
                  <Image source={require("../../../assets/icons/location.png")} style={styles.addressIcon} />
                  <Text style={[styles.addressText, { fontSize: 14, color: "#555", width: '70%' }]}
                    numberOfLines={1} ellipsizeMode="tail">
                    {displayBranchAddress()}
                  </Text>
                </View>
              )}

              {(todaySchedule?.start_time || todaySchedule?.end_time) && (
                <View style={styles.addressLine}>
                  <Image source={require("../../../assets/icons/clock.png")} style={styles.addressIcon} />
                  <Text style={[styles.addressText, { fontSize: 14, color: "#333" }]}>
                    {formatTime(todaySchedule.start_time)} - {formatTime(todaySchedule.end_time)}
                  </Text>
                </View>
              )}
            </View>
          </CartBox>
        )}

        {!checkedIn ? (
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
              // onPress={handleCheckIn}
              // onPress={() => {
              //     setShowPopup(true);
              // }}

              onPress={() => {
                // First: check if user is within allowed radius
                if (!withinRange) {
                  showErrorToast("You are too far from the shop. Cannot check in.");
                  return; // stop execution
                }

                // Second: check schedule timing
                if (handleCheckInAttempt()) {
                  setShowPopup(true); // show confirmation popup
                } else {
                  showErrorToast(`You can only check in 15 minutes before ${todaySchedule?.start_time}`);
                }
              }}
              backgroundColor={withinRange ? colors.primary : colors.button_background}
              textStyle={{ color: withinRange ? colors.button_background : colors.button_text }}
              containerStyle={styles.checkinBtn}
            />
          </>
        ) : (
          <View style={{ width: "100%", alignItems: "flex-start" }}>
            {/* Status Row */}
            <View style={styles.statusRow}>
              <Text style={{ fontWeight: "600", flex: 1, fontSize: fonts.size.l }}>{lang.currentStatus}</Text>
              <View style={styles.statusBadge(!!checkOutTime)}>
                <Text style={styles.statusText}>
                  {checkOutTime ? lang.offDuty : lang.onDuty}
                </Text>
              </View>
            </View>

            {/* Info Box */}
            <View style={styles.infoBox}>
              {checkInTime && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Checkedin At</Text>
                  <Text style={styles.infoValue}>{formatTime(checkInTime)}</Text>
                </View>
              )}

              {checkOutTime && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>CheckedOut At</Text>
                  <Text style={styles.infoValue}>{formatTime(checkOutTime)}</Text>
                </View>
              )}

              {/* ✅ Always show Duration if check-in exists */}
              {checkInTime && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Duration</Text>
                  <Text style={styles.durationValue}>{duration}</Text>
                </View>
              )}
            </View>

            {!checkedOut && (
              <Button1
                text={lang.checkOut}

                backgroundColor={colors.primary}
                textStyle={{ color: colors.secondary }}
                containerStyle={styles.checkinBtn}
                onPress={() => {
                  if (canCheckOut) {
                    setShowCheckoutPopup(true);
                  } else {
                    showErrorToast("You can’t check out yet. Please wait until your shift ends.");
                  }
                }}
              />
            )}

            {/* Checkout Popup */}
            <Popup
              visible={showCheckoutPopup}
              onClose={() => setShowCheckoutPopup(false)}
              // onConfirm={handleCheckOut} 
              popupBorderColor={colors.primary}
              dismissOnOverlayPress={false}
              title={lang.confirmCheckOut}
              titleStyle={colors.primary}
            >
              <Text style={styles.popupText}>
                {lang.checkoutMessage}
              </Text>
              <View style={styles.popupBtnContainer}>
                <Button1
                  text={lang.yes}
                  backgroundColor={colors.primary}
                  width="45%"
                  onPress={() => {
                    handleCheckOut();
                    setShowCheckoutPopup(false); // popup close for the checkout confirm popup
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
        )}

        {/* Check In Popup */}
        <Popup
          visible={showPopup}
          onClose={() => setShowPopup(false)}
          popupBorderColor={colors.primary}
          dismissOnOverlayPress={false}
          title={lang.confirmCheckIn}
          titleStyle={{ color: colors.primary }}
        >
          <Text style={styles.popupText}>
            {lang.checkinMessage} <Text style={{ color: colors.primary }}>{lang.yes}</Text>.
          </Text>
          <View style={styles.popupBtnContainer}>
            <Button1
              text={lang.yes}
              backgroundColor={colors.primary}
              width="45%"
              onPress={() => {
                handleCheckIn();
                setShowPopup(false);

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

      </ScrollView>
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
    paddingTop: "20%",
    padding: 20,
  },
  date: {
    fontSize: fonts.size.m,
    color: colors.search,
    marginBottom: 5,
  },
  welcome: {
    fontSize: fonts.size.xxl,
    fontWeight: fonts.weight.bold as any,
    marginBottom: 50,
  },

  headingContainer: {
    flexDirection: "row",
    marginBottom: 8, // space between heading and CartBox
    alignSelf: 'flex-start'
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
    fontWeight: fonts.weight.regular as any,
  },

  middle: {
    alignItems: "center",
    marginBottom: 20,
    marginTop: 50
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
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    marginTop: 50
  },
  statusBadge: (offDuty: boolean) => ({
    backgroundColor: offDuty ? colors.primary : colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,

  }),
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
    fontWeight: fonts.weight.semibold as any,
    color: colors.text,
  },
  durationValue: {
    fontSize: fonts.size.l,
    fontWeight: fonts.weight.semibold as any,
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
});