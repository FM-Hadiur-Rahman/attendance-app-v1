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
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../components/Toast";
import CartBox from "../../../components/CartBox";
import { useNavigation } from "@react-navigation/native";
import { getProfile, ProfileUser } from '../../../api/profile';
import {
  startAttendance,
  endAttendance,
  getTodaySchedule,
  getBranchDetails,
  getMyAttendanceHistory,
} from '../../../api/checkin_checkout';
import moment from 'moment';


interface WorkHour {
  id: string;
  user_id: string;
  check_in: string; // "HH:MM:SS"
  check_out: string; // "HH:MM:SS" or empty
  date: string; // YYYY-MM-DD
  createDate: string;
  updateDate: string;
}

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
  const [currentUser, setCurrentUser] = useState<ProfileUser | null>(null);


  // branchInfo will always contain a displayable string in `.address`
  const [branchInfo, setBranchInfo] = useState<{
    name?: string;
    address?: string;
    coordinates?: { latitude: number; longitude: number } | null;
    raw?: any;
  } | null>(null);

  // derive shop coords from branchInfo (no dummy getBranchById)
  const SHOP_LAT = branchInfo?.coordinates?.latitude ?? 0;
  const SHOP_LON = branchInfo?.coordinates?.longitude ?? 0;

  const [branchAddress, setBranchAddress] = useState<string | null>(null);
  const navigation = useNavigation();
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


  const [allSchedules, setAllSchedules] = useState<any[]>([]); // for schedules from API

  // local work hours store (replaces dummy workHours)
  const [localWorkHours, setLocalWorkHours] = useState<WorkHour[]>([]);

  const CHECKIN_RADIUS = 10000000; // keep radius same (meters)

  const tryReverseGeocode = async (lat: number, lon: number) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return `Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}`;
      }

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
      return null;
    } catch (err) {
      console.warn("❌ reverseGeocode failed:", err);
      return null;
    }
  };
  const extractLatLon = (branchRawOrObj: any): { lat?: number; lon?: number } | null => {
    if (!branchRawOrObj) return null;
    const candidates = [
      branchRawOrObj.location?.coordinates,
      branchRawOrObj.address?.coordinates,
      branchRawOrObj.raw?.location?.coordinates,
      branchRawOrObj.raw?.address?.coordinates,
      branchRawOrObj.coordinates,
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number") {
        const a = c[0], b = c[1];
        if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
          const latIfA = a, lonIfA = b;
          const latIfB = b, lonIfB = a;
          if (Math.abs(latIfA) <= 90 && Math.abs(lonIfA) <= 180 && Math.abs(latIfB) <= 90 && Math.abs(lonIfB) <= 180) {
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

        const coords = extractLatLon(branch) ?? extractLatLon(branch.raw) ?? null;
        let resolvedAddress: string | null = null;
        let finalLat: number | undefined;
        let finalLon: number | undefined;

        if (typeof branch.address === "string" && branch.address.trim().length > 0) {
          resolvedAddress = branch.address;
        }

        if (coords) {
          finalLat = coords.lat;
          finalLon = coords.lon;

          const firstTry = await tryReverseGeocode(finalLat, finalLon);
          if (firstTry) {
            resolvedAddress = firstTry;
          } else {
            const swappedTry = await tryReverseGeocode(finalLon, finalLat);
            if (swappedTry) {
              resolvedAddress = swappedTry;
              const tmp = finalLat; finalLat = finalLon; finalLon = tmp;
            }
          }
        }

        if (!resolvedAddress && typeof finalLat === "number" && typeof finalLon === "number") {
          resolvedAddress = `Lat: ${finalLat.toFixed(6)}, Lon: ${finalLon.toFixed(6)}`;
        }

        if (!resolvedAddress) {
          resolvedAddress = branch.name ?? "Address not available";
        }

        if (mounted) {
          setBranchInfo({
            name: branch.name ?? branch.id ?? "Branch",
            address: resolvedAddress,
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
          setBranchInfo((prev: any) => ({
            ...(prev || {}),
            name: prev?.name ?? (todaySchedule?.branch?.name ?? "Branch"),
            address: prev?.address ?? "Address not available",
          }));
        }
      }
    };

    fetchAndResolve();
    return () => { mounted = false; };
  }, [todaySchedule]);

  useEffect(() => {
    if (todaySchedule?.raw?.branch_id?._id) {
      getBranchDetails(todaySchedule.raw.branch_id._id)
        .then((branch) => {
          if (branch) setBranchInfo(prev => prev ?? {
            name: branch.name,
            address: branch.address ?? undefined,
            coordinates: (branch.location?.coordinates && Array.isArray(branch.location.coordinates))
              ? { latitude: branch.location.coordinates[1], longitude: branch.location.coordinates[0] }
              : null,
            raw: branch.raw ?? branch,
          });
        })
        .catch((err) => console.error("❌ Branch info fetch failed:", err));
    }
  }, [todaySchedule]);

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

  const loadTodaySchedule = async () => {
    try {
      setLoading(true);

      const branchId = currentUser?.branch_id;

      const resp = await getTodaySchedule({
        userId,
        branchId,
        timezone: "Asia/Colombo",
      });

      const schedules = resp?.schedules ?? [];
      const rawToday = resp?.todaySchedule ?? resp ?? null;

      console.log("📌 Today schedule:", rawToday);
      console.log("📦 Total schedules fetched:", schedules.length);

      if (!rawToday) {
        setTodaySchedule(null);
        setBranchInfo(null);
        setAllSchedules(schedules);
        return;
      }

      const raw = rawToday.raw ?? rawToday;
      const start_time = rawToday.start_time ?? raw.start_time ?? raw.start ?? "";
      const end_time = rawToday.end_time ?? raw.end_time ?? raw.end ?? "";

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

      const branchName = rawToday.branchname ?? raw.branch_id?.name ?? raw.branch?.name ?? null;
      const branchAddress = raw.branch_id?.address ?? raw.branch?.address ?? "";

      const scheduleObj = {
        start_time,
        end_time,
        duration,
        date: raw.date ?? new Date().toISOString().split("T")[0],
        branch: branchName
          ? { name: branchName, address: branchAddress, rawBranch: raw.branch_id ?? raw.branch ?? null }
          : null,
        raw,
      };

      setTodaySchedule(scheduleObj);
      setBranchInfo(scheduleObj.branch);
      setAllSchedules(schedules);
    } catch (err) {
      console.error("❌ Error loading today's schedule:", err);
      setTodaySchedule(null);
      setBranchInfo(null);
      setAllSchedules([]);
    } finally {
      setLoading(false);
    }
  };

  const refreshLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("❌ Location permission denied");
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
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
    await Promise.all([loadTodaySchedule(), refreshLocation()]);
  };

  useEffect(() => {
    reloadAll();

    const interval = setInterval(loadTodaySchedule, 1000 * 60 * 5);

    return () => clearInterval(interval);
  }, [userId, currentUser?.branch_id]);

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

  useEffect(() => {
    console.log("📌 todaySchedule updated:", todaySchedule);
  }, [todaySchedule]);

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


  const formatTime12h = (date: Date | string) => {
    let d: Date;
    if (typeof date === "string") {
      // If string like "14:35:00", parse to Date
      const [hour, minute] = date.split(":").map(Number);
      d = new Date();
      d.setHours(hour, minute, 0, 0);
    } else {
      d = date;
    }

    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12; // convert 0 to 12
    const minuteStr = minutes.toString().padStart(2, "0");

    return `${hours}:${minuteStr} ${ampm}`;
  };



  const parseTimeStringToDate = (timeStr?: string | Date) => {
    const d = new Date();
    if (!timeStr) return d;

    if (timeStr instanceof Date) return timeStr;

    const trimmed = String(timeStr).trim();
    const lower = trimmed.toLowerCase();

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

    const [h = 0, m = 0, s = 0] = trimmed.split(":").map(Number);
    d.setHours(h || 0, m || 0, s || 0, 0);
    return d;
  };


  // add / update local work hours (replaces dummy global workHours)
  const addWorkHour = (uid: string, checkInTimeDate: Date): WorkHour => {
    const newId = `WH${(localWorkHours.length + 1).toString().padStart(3, "0")}`;
    const formattedTime = checkInTimeDate.toTimeString().split(" ")[0];
    const formattedDate = checkInTimeDate.toISOString().split("T")[0];

    const newRecord: WorkHour = {
      id: newId,
      user_id: uid,
      check_in: formattedTime,
      check_out: "",
      date: formattedDate,
      createDate: checkInTimeDate.toISOString(),
      updateDate: checkInTimeDate.toISOString(),
    };

    setLocalWorkHours(prev => [...prev, newRecord]);
    return newRecord;
  };

  const updateWorkHour = (uid: string, checkOutTimeDate: Date): WorkHour | null => {
    // Find last record for user without check_out
    const idx = [...localWorkHours].reverse().findIndex(w => w.user_id === uid && !w.check_out);
    if (idx === -1) {
      console.warn("⚠️ No active work record found for check-out.");
      return null;
    }
    // reverse index -> actual index
    const actualIndex = localWorkHours.length - 1 - idx;
    const updated = { ...localWorkHours[actualIndex] };
    const formattedTime = checkOutTimeDate.toTimeString().split(" ")[0];
    updated.check_out = formattedTime;
    updated.updateDate = checkOutTimeDate.toISOString();

    setLocalWorkHours(prev => {
      const next = [...prev];
      next[actualIndex] = updated;
      return next;
    });
    return updated;
  };

  useEffect(() => {
    const fetchBranchAddress = async () => {
      const branchId = todaySchedule?.branch?.rawBranch?._id;
      if (!branchId) return;

      try {
        const branch = await getBranchDetails(branchId);

        if (!branch?.location?.coordinates) return;

        const [longitude, latitude] = branch.location.coordinates; // GeoJSON format

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        const result = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (result.length > 0) {
          const place = result[0];
          const formatted = `${place.name ? place.name + ", " : ""}${place.street ? place.street + ", " : ""}${place.city || ""}${place.region ? ", " + place.region : ""}${place.postalCode ? ", " + place.postalCode : ""}${place.country ? ", " + place.country : ""}`;

          setBranchInfo({
            name: branch.name,
            address: formatted,
            coordinates: { latitude, longitude },
          });
          console.log("✅ Branch address:", formatted);
        }
      } catch (err) {
        console.log("❌ Error fetching branch address:", err);
      }
    };

    fetchBranchAddress();
  }, [todaySchedule]);

  // shop address from branch coordinates
  const [shopAddress, setShopAddress] = useState<string | null>(null);
  const displayBranchAddress = () => {
    if (!branchInfo) return "No branch address";
    if (typeof branchInfo.address === "string") return branchInfo.address;
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
  const [todayRecord, setTodayRecord] = useState<WorkHour | null>(null);

  // formatTime helper
  const formatTime = (time: string | Date | null) => {
    if (!time) return "--:--";
    if (time instanceof Date) return formatTime12h(time);
    const s = String(time);
    if (s.toLowerCase().includes("am") || s.toLowerCase().includes("pm")) return s;
    return formatTime12h(parseTimeStringToDate(s));
  };

  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    if (!checkedIn) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [checkedIn]);

  const handleCheckIn = async () => {
    handleCheckInAttempt(); // shows toast if too early

    if (!todaySchedule) {
      showErrorToast(lang.noScheduleToday);
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
        branch: todaySchedule.branchname || "Unknown Branch",
      };
      await startAttendance(payload);
      const nowDate = new Date();
      const inTime = formatTime12h(nowDate); // convert to 12-hour format
      setCheckInTime(inTime);

      setCheckedIn(true);
      setCanCheckOut(true);
      setCheckInTime(inTime);
      setCheckOutTime(null);
      setDuration("--");

      const saved = addWorkHour(userId, nowDate);
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

    const nowDate = new Date();
    const [startHour, startMin] = (todaySchedule.start_time || "00:00").split(":").map(Number);
    const [endHour, endMin] = (todaySchedule.end_time || "23:59").split(":").map(Number);

    const scheduleStart = new Date(nowDate);
    scheduleStart.setHours(startHour, startMin, 0, 0);

    const scheduleEnd = new Date(nowDate);
    scheduleEnd.setHours(endHour, endMin, 0, 0);

    const checkInDate = parseTimeStringToDate(checkInTime);

    if (nowDate < scheduleStart) {
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
        branch: todaySchedule.branch?.name || "Unknown Branch",
      };
      await endAttendance(payload);

      const nowDate = new Date();
      const checkOutStr = formatTime12h(nowDate);
      setCheckOutTime(checkOutStr);

      setCheckOutTime(checkOutStr);
      let diffMs = nowDate.getTime() - checkInDate.getTime();
      if (diffMs < 0) diffMs = 0;

      const diffMinutes = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMinutes / 60);
      const remainingMinutes = diffMinutes % 60;
      const durationStr = `${diffHours > 0 ? diffHours + "h " : ""}${remainingMinutes}m`;

      setCheckOutTime(checkOutStr);
      setDuration(durationStr);
      setCheckedOut(true);
      setCanCheckOut(false);
      setShowPopup(false);

      const updated = updateWorkHour(userId, nowDate);
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

        if (!SHOP_LAT || !SHOP_LON) return;

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
  }, [SHOP_LAT, SHOP_LON]);

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
  }, [SHOP_LAT, SHOP_LON]);

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
    d.setHours(isNaN(hours) ? 0 : hours, isNaN(minutes) ? 0 : minutes, isNaN(seconds) ? 0 : seconds, 0);
    return d;
  };

  const calculateDuration = (checkInTime: string | null, checkOutTime: string | null) => {
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

  // load today's record from localWorkHours
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const record = [...localWorkHours].reverse().find(
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
      setTodayRecord(null);
      setCheckedIn(false);
      setCheckInTime(null);
      setCheckOutTime(null);
      setDuration("--");
    }
  }, [userId, localWorkHours]);

  useEffect(() => {
    const interval = setInterval(() => {
      const todayStr = new Date().toISOString().split("T")[0];
      if (todayRecord && todayRecord.date !== todayStr) {
        setTodayRecord(null);
        setCheckedIn(false);
        setCheckInTime(null);
        setCheckOutTime(null);
        setDuration("--");
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [todayRecord]);

  const formatTo12Hour = (time) => {
    if (!time) return "";
    const [hour, minute] = time.split(":");
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12; // convert 0 to 12
    return `${h}:${minute} ${ampm}`;
  };


  useEffect(() => {
    let mounted = true;

    const fetchAttendance = async () => {
      try {
        const todayRecords = await getMyAttendanceHistory(); // Already filtered today
        console.log("📌 Today Records from Helper:", todayRecords.length);
        console.log("📌 Today Records from Helper records:", todayRecords);
        if (!mounted) return;

        if (!todayRecords || todayRecords.length === 0) {
          // no attendance today
          setAttendanceToday(null);
          setCheckInTime(null);
          setCheckOutTime(null);
          setDuration("0h 0m");
          setCheckedIn(false);
          setCheckedOut(false);
          setCanCheckOut(false);
          return;
        }

        // pick latest record by In
        todayRecords.sort((a, b) => moment(b.In).valueOf() - moment(a.In).valueOf());
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

        // 🔥 Shift / canCheckOut logic: allow checkout only if user has checked in and not checked out, and schedule allows
        let shiftEndMoment: moment.Moment | null = null;
        if (todaySchedule?.end_time && inMoment) {
          const [eh, em] = todaySchedule.end_time.split(":").map(Number);
          shiftEndMoment = inMoment.clone().set({ hour: eh, minute: em, second: 0 });
          if (shiftEndMoment.isBefore(inMoment)) shiftEndMoment.add(1, "day");
        }

        // If there's an In and no Out, allow check out when now >= in + scheduled duration OR when now >= shiftEndMoment (fallback)
        let allowedToCheckOut = false;
        if (hasIn && !hasOut && inMoment) {
          if (typeof todaySchedule?.duration === "number" && todaySchedule.duration > 0) {
            const allowed = inMoment.clone().add(todaySchedule.duration, "hours");
            allowedToCheckOut = now.isSameOrAfter(allowed);
          }
          if (!allowedToCheckOut && shiftEndMoment) {
            allowedToCheckOut = now.isSameOrAfter(shiftEndMoment);
          }
        }

        setCanCheckOut(allowedToCheckOut);
      } catch (err) {
        console.error("❌ fetchAttendance error:", err);

        if (!mounted) return;

        setAttendanceToday(null);
        setCheckInTime(null);
        setCheckOutTime(null);
        setDuration("0h 0m");
        setCheckedIn(false);
        setCheckedOut(false);
        setCanCheckOut(false);
      }
    };

    fetchAttendance();

    const interval = setInterval(fetchAttendance, 1000 * 60 * 2);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [userId, currentUser?.branch_id, todaySchedule]);



  const onRefresh = async () => {
    setRefreshing(true);
    await reloadAll();
    setRefreshing(false);
  };

  // ---------- JSX (return) ----------
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
            navigation.navigate("C_NotificationScreen" as any, {
              userId: userId,
              langId: langId || "en",
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
        <Text
          style={styles.welcome}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
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
            alignItems='flex-start'
            paddingTop={10}
            paddingBottom={10}
            paddingLeft={10}
          >
            <View style={styles.addressContainer}>
              {todaySchedule && branchInfo ? (
                <View style={styles.addressLine}>
                  <Image
                    source={require("../../../assets/icons/branch.png")}
                    style={styles.addressIcon1}
                  />
                  <Text style={styles.addressText}>
                    {branchInfo.name}
                  </Text>
                </View>
              ) : (
                <View style={styles.addressLine}>
                  <Text
                    style={[
                      styles.addressText,
                      { color: colors.button_text, },
                    ]}
                  >
                    No assignment or shift scheduled for today.
                  </Text>
                </View>
              )}

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

        {!(attendanceToday && attendanceToday.In) ? (
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
                  showErrorToast("You don't have schedule for today");
                  return;
                }

                if (!withinRange) {
                  showErrorToast("You are too far from the shop. Cannot check in.");
                  return;
                }

                if (handleCheckInAttempt()) {
                  setShowPopup(true);
                } else {
                  showErrorToast(
                    `You can only check in 15 minutes before ${todaySchedule?.start_time}`
                  );
                }
              }}
              backgroundColor={
                todaySchedule && branchInfo && withinRange
                  ? colors.primary
                  : colors.button_background
              }
              textStyle={{
                color:
                  todaySchedule && branchInfo && withinRange
                    ? colors.button_background
                    : colors.subtext2
              }}
              containerStyle={styles.checkinBtn}
            />
          </>

        ) : (
          <View style={{ width: "100%", alignItems: "flex-start" }}>
            <View style={styles.statusRow}>
              <Text style={{ fontWeight: "600", flex: 1, fontSize: fonts.size.l , alignItems : "flex-start", marginRight:20}}>
                {lang.currentStatus}
              </Text>
              <View style={styles.statusBadge(!!checkOutTime)}>
                <Text style={styles.statusText}>
                  {checkOutTime ? lang.offDuty : lang.onDuty}
                </Text>
              </View>
            </View>

            <View style={styles.infoBox}>
              {checkInTime && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Checked in At</Text>
                  <Text style={styles.infoValue}>{formatTo12Hour(checkInTime)}</Text>
                </View>
              )}

              {checkOutTime && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Checked Out At</Text>
                  <Text style={styles.infoValue}>{formatTo12Hour(checkOutTime)}</Text>
                </View>
              )}

              {checkInTime && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Duration</Text>
                  <Text style={styles.durationValue}>{duration}</Text>
                </View>
              )}
            </View>

            {!checkOutTime && (
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

            <Popup
              visible={showCheckoutPopup}
              onClose={() => setShowCheckoutPopup(false)}
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
    fontWeight: fonts.weight.bold as any,
    marginBottom: 50,
    textAlign: 'center',

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
    width: "100%",
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
    borderColor: "#000",
    borderRadius: 10,
    padding: 12,        // adds space inside border
    marginTop: 20,
    backgroundColor: "#fff",
    flexDirection: 'row',
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