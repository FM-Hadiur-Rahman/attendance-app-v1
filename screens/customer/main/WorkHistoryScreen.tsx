// screens/customer/main/WorkHistoryScreen.tsx
import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  Image,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import Header from "../../../components/Header";
import CartBox from "../../../components/CartBox";
import colors from "../../../styles/Colors";
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json";
import * as Location from "expo-location";
import { getMonthlySchedules, getMonthlySchedules1, getMyAttendanceHistory, getMyAttendanceHistory1 } from "../../../api/checkin_checkout";
import { getProfile, ProfileUser } from "../../../api/profile";
import { getAllBranches, Branch } from "../../../api/Branchs";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* ---------- interfaces ---------- */
interface Props {
  userId?: string;
  langId?: string;
}

type BranchIdValue = 
  | string 
  | null 
  | undefined 
  | { _id?: string; id?: string; branch_id?: string; branchId?: string };

interface AttendanceItem {
  id?: string;
  _id?: string;
  In?: string;
  Out?: string;
  actualIn?: string;
  actualOut?: string;
  date?: string;
  dateOut?: string;
  branch_id?: string | { _id?: string; name?: string };
  branch?: string | { _id?: string; id?: string; name?: string; latitude?: number; longitude?: number };
  branchId?: string;
  employeeId?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface SectionData {
  title: string;
  data: AttendanceItem[];
}

type Translations = Record<string, Record<string, string>>;

interface BranchLocation {
  type?: 'Point';
  coordinates?: [number, number];
  address?: string;
}

const normalizeBranchIdValue = (v: BranchIdValue): string | undefined => {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    return v._id ?? v.id ?? v.branch_id ?? v.branchId ?? undefined;
  }
  return undefined;
};

const calcDuration = (checkIn: Date, checkOut?: Date) => {
  if (!checkIn) return { h: 0, m: 0, text: "00h 00m" };

  const now = checkOut || new Date(); // Use current time if no checkOut
  let diffMinutes = (now.getTime() - checkIn.getTime()) / 60000;
  if (diffMinutes < 0) diffMinutes = 0; // No negative durations

  const h = Math.floor(diffMinutes / 60);
  const m = Math.floor(diffMinutes % 60);
  return { h, m, text: `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m` };
};

/* ---------- group schedules ---------- */
/**
 * Groups schedule entries into sections:
 *  - "Today"
 *  - "This Week"
 *  - "Mon d - Mon d" (previous weeks, newest first)
 *
 * This handles various date property names (In, actualIn, date) and uses UTC-safe normalization.
 */
const groupSchedulesByWeek = (entries: AttendanceItem[]) => {
  if (!entries.length) return [];

  const todayYMD = new Date().toISOString().split("T")[0];

  const groups: Record<string, AttendanceItem[]> = {};

  const formatWeekRange = (start: Date, end: Date) => {
    const opt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${start.toLocaleDateString(undefined, opt)} - ${end.toLocaleDateString(undefined, opt)}`;
  };

  const now = new Date();
  const dow = now.getDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + offsetToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  entries.forEach(s => {
    if (!s.In) return;
    const date = new Date(s.In);
    const ymd = date.toISOString().split("T")[0];

    if (ymd === todayYMD) {
      groups["Today"] = [...(groups["Today"] || []), s];
    } else if (date >= weekStart && date <= weekEnd) {
      groups["This Week"] = [...(groups["This Week"] || []), s];
    } else {
      const ws = new Date(date);
      const d = ws.getDay();
      const off = d === 0 ? -6 : 1 - d;
      ws.setDate(ws.getDate() + off);

      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);

      const label = formatWeekRange(ws, we);
      groups[label] = [...(groups[label] || []), s];
    }
  });

  const finalSections: SectionData[] = [];
  if (groups["Today"]) finalSections.push({ title: "Today", data: groups["Today"] });
  if (groups["This Week"]) finalSections.push({ title: "This Week", data: groups["This Week"] });

  Object.keys(groups)
    .filter(k => k !== "Today" && k !== "This Week")
    .sort((a, b) => {
      // Safe access using Object.entries to avoid Object Injection Sink
      const getGroup = (key: string): AttendanceItem[] | null => {
        const entry = Object.entries(groups).find(([k]) => k === key);
        return entry ? entry[1] : null;
      };
      const groupB = getGroup(b);
      const groupA = getGroup(a);
      const dateA = groupB?.[0]?.In;
      const dateB = groupA?.[0]?.In;
      if (!dateA || !dateB) return 0;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    })
    .forEach(k => {
      const entry = Object.entries(groups).find(([key]) => key === k);
      if (entry) {
        finalSections.push({ title: k, data: entry[1] });
      }
    });

  return finalSections;
};



/* ---------- main screen ---------- */
const screenWidth = Dimensions.get("window").width;

const WorkHistoryScreen: React.FC<Props> = ({ langId }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [branchAddresses, setBranchAddresses] = useState<Record<string, string>>({});
  const [currentUser, setCurrentUser] = useState<ProfileUser | null>(null);
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchDistances, setBranchDistances] = useState<Record<string, number>>({});
  const [user, setUser] = useState<ProfileUser | null>(null);

  const [schedules, setSchedules] = useState<AttendanceItem[]>([]);
  const [sections, setSections] = useState<SectionData[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tempSections, setTempSections] = useState(sections);
  const [lastTotals, setLastTotals] = useState({ today: 0, month: "00h 00m" });

  const limit = 10; // items per page
  const totalVisible = page * limit;

  const getDistanceFromLatLonInMeters = (
    lat1: number, lon1: number, lat2: number, lon2: number
  ) => {
    const R = 6371000; // radius of Earth in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

const onRefresh = useCallback(() => {
  setRefreshing(true);

  (async () => {
    try {
      const prof = await getProfile();
      setCurrentUser(prof);

      if (prof._id) {
        const monthSchedules = await getMonthlySchedules1({
          userId: prof._id,
          userBranchId: prof.branch,
        });

        const safeData = Array.isArray(monthSchedules) ? monthSchedules : [];
        setSchedules(safeData);

        const grouped = groupSchedulesByWeek(safeData);
        setSections(grouped);

        // DO NOT reset page here
        // setPage(1);
      }
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      setRefreshing(false);
    }
  })();
}, []);




  useEffect(() => {
    const loadUser = async () => {
      const data = await AsyncStorage.getItem("user");
      if (data) {
        try {
          const parsedUser = JSON.parse(data) as ProfileUser;
          setUser(parsedUser);
        } catch (err) {
          console.error("Failed to parse user from AsyncStorage:", err);
        }
      }
    };
    void loadUser();
  }, []);

  // fetch profile on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await getProfile();
        setCurrentUser(user);
      } catch (err) {
        console.error("Failed to fetch user profile:", err);
      }
    };

    void fetchUser();
  }, []);

  // fetch schedules when profile is available
  useEffect(() => {
    if (!currentUser?._id) return;

    let isMounted = true;

    const fetchSchedules = async () => {
      try {
        setLoading(true);
        const monthSchedules = await getMonthlySchedules1({
          userId: currentUser._id,
          userBranchId: currentUser.branch ?? null,
        });

        if (!isMounted) return;

        const safeData = Array.isArray(monthSchedules) ? monthSchedules : [];
        setSchedules(safeData);

        const grouped = groupSchedulesByWeek(safeData);
        setSections(grouped);
        setPage(1);
      } catch (err) {
        console.error("Failed to fetch monthly schedules:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchSchedules();
    return () => {
      isMounted = false;
    };
  }, [currentUser?._id, currentUser?.branch]);

  // fetch branches metadata once
useEffect(() => {
  const fetchBranchData = async () => {
    try {
      const all = await getAllBranches();
      if (!Array.isArray(all)) return;

      setBranches(all);

      const namesMap: Record<string, string> = {};
      const addressesMap: Record<string, string> = {};

      all.forEach((b) => {
        if (!b._id) return;

        namesMap[b._id] = b.name || "Unnamed Branch";

        const loc = b.location as BranchLocation | undefined;

        const address: string | undefined = loc?.address;

        if (address) {
          // ✅ address exists in API
          addressesMap[b._id] = address;
        } else if (loc?.coordinates?.length === 2) {
          // Fallback to coordinates
          const lat = loc.coordinates[1];
          const lon = loc.coordinates[0];
          addressesMap[b._id] = `${lat}, ${lon}`;
        } else {
          addressesMap[b._id] = "No address available";
        }
      });

      setBranchNames(namesMap);
      setBranchAddresses(addressesMap);
    } catch (err) {
      console.error("Error loading branches:", err);
    }
  };

  void fetchBranchData();
}, []);


  // compute distances to branches when branches or user location available
  useEffect(() => {
    const fetchDistances = async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        const coords = pos?.coords;
        if (!coords) return;

        const { latitude: userLat, longitude: userLon } = coords;
        const distances: Record<string, number> = {};

        branches.forEach(branch => {
          const bcoords = branch.location?.coordinates;
          if (bcoords?.length === 2) {
            const lat = bcoords[1]; // latitude
            const lon = bcoords[0]; // longitude
            distances[branch._id] = getDistanceFromLatLonInMeters(userLat, userLon, lat, lon);
          }
        });

        setBranchDistances(distances);
      } catch (err) {
        console.warn("Could not get user location for distances:", err);
      }
    };

    if (branches.length > 0) void fetchDistances();
  }, [branches]);

  // reverse geocode readable addresses for branches (will respect permission)
const fetchBranchAddresses = async (branchesList: Branch[]) => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    console.warn("Location permission denied");
    return {};
  }

  const addresses: Record<string, string> = {};

  await Promise.all(
    branchesList.map(async (branch) => {
      const coords = branch.location?.coordinates;
      if (!coords?.length) {
        addresses[branch._id] = "No coordinates";
        return;
      }
      const [lon, lat] = coords;
      console.log(`🔹 Branch ${branch._id} coords: lat=${lat}, lon=${lon}`);
      try {
        // Try reverse geocode
        const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });

        if (res && res.length > 0) {
          const { name, street, city, region, postalCode, country } = res[0];
          const addr = [name, street, city, region, postalCode, country].filter(Boolean).join(", ");
          addresses[branch._id] = addr || `${lat.toFixed(5)}, ${lon.toFixed(5)}`; // fallback if empty
        } else {
          // Fallback to lat/lon if reverse geocode empty
          addresses[branch._id] = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        }
      } catch (err) {
        console.error(`❌ Reverse geocoding failed for branch ${branch._id}:`, err);
        addresses[branch._id] = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      }
    })
  );

  return addresses;
};


  useEffect(() => {
    const loadAddresses = async () => {
      try {
        if (branches.length === 0) return;
        const addrs = await fetchBranchAddresses(branches);
        if (addrs) setBranchAddresses(addrs);
      } catch (err) {
        console.error("Error loading branch addresses:", err);
      }
    };

    void loadAddresses();
  }, [branches]);

  const currentLang = langId || "en";
  // Safe access to translations using Object.entries to avoid Object Injection Sink
  const getTranslation = (lang: string): Record<string, string> => {
    const entry = Object.entries(translations as Translations).find(([k]) => k === lang);
    if (entry) return entry[1];
    const defaultEntry = Object.entries(translations as Translations).find(([k]) => k === "en");
    return defaultEntry ? defaultEntry[1] : {};
  };
  const lang = getTranslation(currentLang);

  // ---------------- totals derived from schedules ----------------
  const totalToText = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  };

  // today total from schedules
const todayTotal = useMemo(() => {
  if (!schedules || schedules.length === 0) return 0;

  const today = new Date();
  let totalMinutes = 0;

  schedules.forEach((s) => {
    const inRaw = s.In ?? s.actualIn ?? s.date;
    const outRaw = s.Out ?? s.actualOut ?? s.dateOut;
    if (!inRaw) return;

    const inTime = new Date(inRaw);
    const outTime = outRaw ? new Date(outRaw) : new Date(); // Use now if no out
    if (isNaN(inTime.getTime()) || isNaN(outTime.getTime())) return;

    if (
      inTime.getFullYear() === today.getFullYear() &&
      inTime.getMonth() === today.getMonth() &&
      inTime.getDate() === today.getDate()
    ) {
      const diff = Math.floor((outTime.getTime() - inTime.getTime()) / 60000);
      totalMinutes += Math.max(0, diff); // No negative
    }
  });

  return totalMinutes;
}, [schedules]);


  // month total from schedules
const monthTotal = useMemo(() => {
  if (!schedules || schedules.length === 0) return 0;

  let totalMinutes = 0;
  const today = new Date();

  schedules.forEach((s) => {
    const inRaw = s.In ?? s.actualIn ?? s.date;
    const outRaw = s.Out ?? s.actualOut ?? s.dateOut;
    if (!inRaw) return;

    const inDate = new Date(inRaw);
    const outDate = outRaw ? new Date(outRaw) : new Date(); // Use now if no out
    if (isNaN(inDate.getTime()) || isNaN(outDate.getTime())) return;

    if (inDate.getFullYear() === today.getFullYear() && inDate.getMonth() === today.getMonth()) {
      const diff = Math.floor((outDate.getTime() - inDate.getTime()) / 60000);
      totalMinutes += Math.max(0, diff);
    }
  });

  return totalMinutes;
}, [schedules]);


  const totalItems = useMemo(
    () => sections.reduce((sum, section) => sum + section.data.length, 0),
    [sections]
  );

const loadSchedules = async () => {
  try {
    setRefreshing(true);

    const all = await getMyAttendanceHistory1();

    if (all && Array.isArray(all)) {
      // Only update after fetch completes
      setSchedules(all);

      const grouped = groupSchedulesByWeek(all);
      setSections(grouped);
      setTempSections(grouped);
      setPage(1);
    }
  } catch (err) {
    console.error("Error loading schedules:", err);
  } finally {
    setRefreshing(false);
  }
};



const visibleSections = useMemo(() => {
  let remaining = totalVisible;
  return tempSections
    .map(sec => {
      const items = sec.data || [];
      if (remaining <= 0) return { ...sec, data: [] };
      const slice = items.slice(0, remaining);
      remaining -= slice.length;
      return { ...sec, data: slice };
    })
    .filter(s => s.data && s.data.length > 0);
}, [tempSections, totalVisible]);


useEffect(() => {
  void loadSchedules();
}, []);


useEffect(() => {
  if (schedules && schedules.length > 0) {
    setLastTotals({
      today: todayTotal,
      month: totalToText(monthTotal),
    });
  }
}, [schedules, todayTotal, monthTotal]);


  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{
          type: "text",
          value: lang.Work_Hours_Log || "Work Hours Log",
          color: colors.text,
        }}
      />
      <View style={styles.body}>
        <View style={styles.summaryRow}>
          <CartBox
            width="48%"
            height={78}
            borderRadius={10}
            justifyContent="center"
            alignItems="flex-start"
            borderWidth={1}
            paddingLeft={12}
            paddingRight={12}
            paddingTop={12}
            paddingBottom={12}
            backgroundColor={colors.secondary}
          >
            <Text style={styles.summaryLabel}>{lang.Today || "Today"}</Text>
              <Text style={styles.summaryValue}>
    {lastTotals.today ? totalToText(lastTotals.today) : "00h 00m"}
  </Text>
          </CartBox>

          <CartBox
            width="48%"
            height={78}
            borderRadius={10}
            justifyContent="center"
            alignItems="flex-start"
            borderWidth={1}
            paddingLeft={12}
            paddingRight={12}
            paddingTop={12}
            paddingBottom={12}
            backgroundColor={colors.secondary}
          >
            <Text style={styles.summaryLabel}>{lang.This_Month || "This Month"}</Text>
             <Text style={styles.summaryValue}>{lastTotals.month}</Text>
          </CartBox>
        </View>


        <View style={styles.logSummaryRow}>
          <Image
            source={require("../../../assets/icons/calender_black.png")}
            style={styles.icon}
            resizeMode="contain"
          />
          <Text style={styles.logSummaryText}>
            {lang.Work_Hours_Log_Summary || "Work Hours Log Summary"}
          </Text>
        </View>

        <SectionList

          sections={visibleSections}
          
          keyExtractor={(item, index) =>
            item.id ? `${item.id}-${index}` : `${item.In ?? item.actualIn ?? item.date}-${item.Out ?? item.actualOut ?? ""}-${index}`
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          renderSectionHeader={({ section }) =>
            section.data.length > 0 ? (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            ) : null
          }
          renderItem={({ item, index }) => {
            const itemBranchId =
              normalizeBranchIdValue(item.branch_id ?? item.branch ?? item.branchId) ??
              normalizeBranchIdValue(item?.branch);

            const loggedBranchId = normalizeBranchIdValue(
              currentUser?.branch
            );

            const showBranchInfo = !!(itemBranchId && loggedBranchId && itemBranchId !== loggedBranchId);
            const branchObj = typeof item.branch === 'object' ? item.branch : null;
            // Safe access to branchNames using Object.entries to avoid Object Injection Sink
            const getBranchNameFromMap = (branchId: string | undefined): string | null => {
              if (!branchId) return null;
              const entry = Object.entries(branchNames).find(([k]) => k === branchId);
              return entry ? entry[1] : null;
            };
            const branchNameFromMap = getBranchNameFromMap(itemBranchId);
            const branchName = branchObj?.name || branchNameFromMap || "Unknown Branch";
            const branchAddress =
              (itemBranchId && branchAddresses[itemBranchId]) ||
              (branchObj && branchObj.latitude !== undefined && branchObj.longitude !== undefined
                ? `${branchObj.latitude}, ${branchObj.longitude}`
                : "Address not available");

            const inDate = item.In ? new Date(item.In) : item.actualIn ? new Date(item.actualIn) : null;
            const outDate = item.Out ? new Date(item.Out) : item.actualOut ? new Date(item.actualOut) : undefined;

            const inTimeText = inDate
              ? inDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
              : "--:--";
            const outTimeText = outDate
              ? outDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
              : "Work in progress";

            const timeText = `${inTimeText} - ${outTimeText}`;

            const durationText = inDate
              ? calcDuration(inDate, outDate).text
              : "--h--m";

            return (
              <CartBox
                key={index}
                marginTop={8}
                paddingRight={12}
                paddingLeft={12}
                paddingTop={12}
                paddingBottom={12}
                borderRadius={10}
                alignItems="flex-start"
              >
                {showBranchInfo && (
                  <View style={styles.brnamerow}>
                    <Image
                      source={require("../../../assets/icons/branch.png")}
                      style={styles.branchIcon}
                      resizeMode="contain"
                    />
                    <Text style={styles.branchName}>{branchName}</Text>
                  </View>
                )}

                {showBranchInfo && (
                  <View style={styles.branchLocationRow}>
                    <Image
                      source={require("../../../assets/icons/location.png")}
                      style={styles.locationIcon}
                      resizeMode="contain"
                    />
                    <Text style={styles.branchLocationText} numberOfLines={1} ellipsizeMode="tail">
                      {branchAddress}
                    </Text>
                  </View>
                )}

                <View style={styles.itemRow}>
                  <Text style={styles.timeText}>{timeText}</Text>
                  <Text style={styles.durationText}>{durationText}</Text>
                </View>

                <Text style={styles.dateText}>
                  {inDate ? inDate.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "2-digit",
                  }) : ""}
                </Text>
              </CartBox>
            );
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              progressBackgroundColor={colors.secondary}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          onEndReached={async () => {
            const total = sections.reduce((sum, s) => sum + s.data.length, 0);
            const visible = page * limit;

            if (visible < total && !loadingMore) {
              setLoadingMore(true);
              await new Promise((resolve) => setTimeout(resolve, 400));
              setPage((prev) => prev + 1);
              setLoadingMore(false);
            }
          }}
          onEndReachedThreshold={0.2}
          ListFooterComponent={() => {
            const total = sections.reduce((sum, s) => sum + s.data.length, 0);
            const visible = page * limit;

            if (loadingMore) {
              return (
                <ActivityIndicator
                  style={{ marginVertical: 16 }}
                  size="small"
                  color={colors.primary}
                />
              );
            }

            if (visible < total) {
              return <View style={{ height: 20 }} />;
            }

            return null;
          }}
        />
      </View>
    </View>
  );
};

export default WorkHistoryScreen;



const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.secondary
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop : 20
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 11,
  },
  summaryLabel: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
    fontFamily: fonts.family.regular,
    color: colors.search,
    minHeight: 16,
    marginBottom: 10,
  },
  summaryValue: {
    fontSize: fonts.size.xxl,
    fontWeight: fonts.weight.medium ,
    fontFamily: fonts.family.regular,
    color: colors.primary,
  },
  logSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 4,
  },
  icon: {
    width: 16, height: 16, marginRight: 4
  },
  logSummaryText: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
    fontFamily: fonts.family.regular,
    color: colors.text,
  },
  sectionTitle: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular ,
    fontFamily: fonts.family.regular,
    color: colors.subtext,
    marginTop: 20,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  timeText: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular ,
    fontFamily: fonts.family.regular,
    color: colors.text,
    minHeight: 16,
  },
  durationText: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.medium ,
    fontFamily: fonts.family.regular,
    color: colors.primary,
    minHeight: 16,
  },
  dateText: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.medium ,
    fontFamily: fonts.family.regular,
    color: colors.subtext,
  },
  brnamerow: {
    flexDirection: "row",
    marginBottom: 8
  },
  branchIcon: {
    width: 16,
    height: 16,
    marginRight: 4
  },
  branchName: {
    fontSize: fonts.size.m,
    fontFamily: fonts.family.regular,
    fontWeight: fonts.weight.regular ,
    color: colors.text,
    lineHeight: 16,
    maxWidth: "90%"
  },

  branchLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  locationIcon: {
    width: 14,
    height: 14,
    marginRight: 4,
  },
  branchLocationText: {
    fontSize: fonts.size.m,
    fontFamily: fonts.family.regular,
    fontWeight: fonts.weight.regular ,
    color: colors.subtext2,
    lineHeight: 14,
    maxWidth: "60%"
  },
});