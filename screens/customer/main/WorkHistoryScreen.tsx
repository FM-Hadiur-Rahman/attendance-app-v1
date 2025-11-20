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
import { getMonthlySchedules } from "../../../api/checkin_checkout";
import { getProfile, ProfileUser } from "../../../api/profile";
import { getAllBranches } from "../../../api/Branchs";
import AsyncStorage from "@react-native-async-storage/async-storage";


/* ---------- interfaces ---------- */
interface Props {
  userId?: string;
  langId?: string;
}

const normalizeBranchIdValue = (v: any): string | undefined => {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    return v._id ?? v.id ?? v.branch_id ?? v.branchId ?? undefined;
  }
  return undefined;
};


const calcDuration = (checkIn?: string, checkOut?: string) => {
  if (!checkIn || !checkOut) return { h: 0, m: 0, text: "00h 00m" };
  const [h1, m1, s1 = 0] = checkIn.split(":").map((v) => Number(v) || 0);
  const [h2, m2, s2 = 0] = checkOut.split(":").map((v) => Number(v) || 0);

  const start = new Date(2000, 0, 1, h1, m1, s1);
  let end = new Date(2000, 0, 1, h2, m2, s2);
  let diffMinutes = (end.getTime() - start.getTime()) / 60000;
  if (diffMinutes < 0) diffMinutes += 24 * 60;

  const h = Math.floor(diffMinutes / 60);
  const m = Math.floor(diffMinutes % 60);
  return { h, m, text: `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m` };
};



/* ---------- main screen ---------- */
const screenWidth = Dimensions.get("window").width;
const WorkHistoryScreen: React.FC<Props> = ({ userId = "U001", langId }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [branchAddresses, setBranchAddresses] = useState<Record<string, string>>({});
  const [currentUser, setCurrentUser] = useState<ProfileUser | null>(null);
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<any[]>([]);
  const [branchDistances, setBranchDistances] = useState<Record<string, number>>({});
  const [user, setUser] = useState(null);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);


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

  useEffect(() => {
    // Example: load user from AsyncStorage or context
    const loadUser = async () => {
      const data = await AsyncStorage.getItem("user");
      if (data) setUser(JSON.parse(data));
    };
    loadUser();
  }, []);

  useEffect(() => {
    const fetchDistances = async () => {
      const { coords } = await Location.getCurrentPositionAsync({});
      if (!coords) return;

      const { latitude: userLat, longitude: userLon } = coords;

      const distances: Record<string, number> = {};

      branches.forEach(branch => {
        const coords = branch.location?.coordinates;
        if (coords?.length === 2) {
          const lat = coords[1]; // latitude
          const lon = coords[0]; // longitude

          distances[branch._id] = getDistanceFromLatLonInMeters(
            userLat,
            userLon,
            lat,
            lon
          );
        }
      });

      setBranchDistances(distances);
    };

    fetchDistances();
  }, [branches]);


  const fetchBranchAddresses = async (branches: any[]) => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      console.warn("Location permission denied");
      return;
    }

    const addresses: Record<string, string> = {};

    for (const branch of branches) {
      const coords = branch.location?.coordinates;
      if (!coords?.length) {
        addresses[branch._id] = "No coordinates";
        continue;
      }

      const [lon, lat] = coords; // GeoJSON: [longitude, latitude]

      try {
        const result = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (result[0]) {
          const { name, street, city, region, postalCode, country } = result[0];
          addresses[branch._id] = [name, street, city, region, postalCode, country]
            .filter(Boolean)
            .join(", ");
        } else {
          addresses[branch._id] = "Unknown location";
        }
      } catch (err) {
        console.error("Reverse geocoding failed for branch", branch._id, err);
        addresses[branch._id] = "Location unavailable";
      }
    }

    return addresses;
  };


  useEffect(() => {
    const loadAddresses = async () => {
      const branches = await getAllBranches();
      const branchAddrs = await fetchBranchAddresses(branches);
      setBranchAddresses(branchAddrs || {}); // Add fallback to empty object
    };

    loadAddresses();
  }, []);

  useEffect(() => {
    const fetchBranchData = async () => {
      try {
        const branches = await getAllBranches(); // ✅ 1 API call
        const namesMap: Record<string, string> = {};
        const addressesMap: Record<string, string> = {};

        branches.forEach((b) => {
          if (!b?._id) return;

          namesMap[b._id] = b.name || "Unnamed Branch";

          // Check if location has an address property (may not exist on all branch objects)
          if (b.location && 'address' in b.location && b.location.address) {
            addressesMap[b._id] = b.location.address as string;
          } else if (b.location?.coordinates?.length === 2) {
            const lat = b.location.coordinates[1];
            const lon = b.location.coordinates[0];
            addressesMap[b._id] = `${lat}, ${lon}`;
          } else {
            addressesMap[b._id] = "No address available";
          }
        });

        setBranchNames(namesMap);
        setBranchAddresses(addressesMap);

        console.log("✅ Branch names loaded:", namesMap);
      } catch (err) {
        console.error("Error loading branches:", err);
      }
    };

    fetchBranchData();
  }, []);


  /* ---------- fetch readable addresses ---------- */
  useEffect(() => {
    const fetchAddresses = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.warn("Permission to access location denied");
        return;
      }

      const newAddresses: Record<string, string> = {};

      for (const branch of branches) {
        try {
          if (!branch.location?.coordinates) {
            newAddresses[branch._id] = "No coordinates available";
            continue;
          }

          const lat = branch.location.coordinates[1];
          const lon = branch.location.coordinates[0];

          const result = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });

          if (result[0]) {
            const { name, street, city, region, postalCode, country } = result[0];
            newAddresses[branch._id] = [name, street, city, region, postalCode, country]
              .filter(Boolean)
              .join(", ");
          } else {
            newAddresses[branch._id] = "Unknown location";
          }
        } catch (err) {
          console.error("Error reverse geocoding branch:", branch._id, err);
          newAddresses[branch._id] = "Location unavailable";
        }
      }

      setBranchAddresses(newAddresses);
    };

    fetchAddresses();
  }, [branches]);



  const currentLang = langId || "en";
  const lang = translations[currentLang as keyof typeof translations] || translations["en"];
  //const [sections, setSections] = useState<{ title: string; data: any[] }[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [sections, setSections] = useState<{ title: string; data: any[] }[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);



  const totalToText = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  };

  //const sections = useMemo(() => groupWorkHours(userWorkHours), [userWorkHours]);

  const todayTotal = useMemo(() => {
    if (!schedules || schedules.length === 0) return 0;

    const today = new Date();
    let totalMinutes = 0;

    schedules.forEach((s) => {
      if (!s.In || !s.Out) return;

      const inTime = new Date(s.In);
      const outTime = new Date(s.Out);

      // check if schedule is today
      if (
        inTime.getFullYear() === today.getFullYear() &&
        inTime.getMonth() === today.getMonth() &&
        inTime.getDate() === today.getDate()
      ) {
        const diff = Math.floor((outTime.getTime() - inTime.getTime()) / 60000);
        totalMinutes += diff;
      }
    });

    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    console.log(`✅ Today Total: ${hours}h ${minutes}m`);

    return totalMinutes;
  }, [schedules]);

  // Calculate month total including seconds
  const monthTotal = useMemo(() => {
    if (!schedules || schedules.length === 0) return { hours: 0, minutes: 0, text: "00h00m" };

    let totalSeconds = 0;

    schedules.forEach((s) => {
      if (!s.In || !s.Out) return;

      const inDate = new Date(s.In);
      const outDate = new Date(s.Out);

      if (isNaN(inDate.getTime()) || isNaN(outDate.getTime())) return;

      // check if the schedule is in the current month
      const today = new Date();
      if (inDate.getFullYear() === today.getFullYear() && inDate.getMonth() === today.getMonth()) {
        totalSeconds += Math.floor((outDate.getTime() - inDate.getTime()) / 1000);
      }
    });

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    console.log(`✅ Month Total: ${hours}h ${minutes}m`);

    return {
      hours,
      minutes,
      text: `${String(hours).padStart(2, "0")}h${String(minutes).padStart(2, "0")}m`
    };
  }, [schedules]);


  const totalVisible = page * limit;

  const visibleSections = sections.map(section => {
    const visibleData = section.data.slice(0, totalVisible);
    return { ...section, data: visibleData };
  });

  const groupSchedulesByWeek = (entries: any[]) => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const groups: Record<string, any[]> = {};

    const formatWeekRange = (start: Date, end: Date) => {
      const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
      return `${start.toLocaleDateString(undefined, options)} - ${end.toLocaleDateString(undefined, options)}`;
    };

    // Monday start
    const dayOfWeek = today.getDay();
    const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const currWeekStart = new Date(today);
    currWeekStart.setDate(today.getDate() + offsetToMonday);
    currWeekStart.setHours(0, 0, 0, 0);
    const currWeekEnd = new Date(currWeekStart);
    currWeekEnd.setDate(currWeekStart.getDate() + 6);
    currWeekEnd.setHours(23, 59, 59, 999);


    entries.forEach((s) => {
      const schedDate = new Date(s.In);
      const dateStr = schedDate.toISOString().slice(0, 10);

      if (dateStr === todayStr) {
        groups["Today"] = groups["Today"] || [];
        groups["Today"].push(s);
      } else if (schedDate >= currWeekStart && schedDate <= currWeekEnd) {
        groups["This Week"] = groups["This Week"] || [];
        groups["This Week"].push(s);
      } else {
        // Past weeks
        const weekStart = new Date(schedDate);
        const d = weekStart.getDay();
        const off = d === 0 ? -6 : 1 - d;
        weekStart.setDate(weekStart.getDate() + off);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const label = formatWeekRange(weekStart, weekEnd);
        groups[label] = groups[label] || [];
        groups[label].push(s);
      }
    });

    // convert to SectionList format
    const sectionArray: { title: string; data: any[] }[] = [];

    if (groups["Today"]) sectionArray.push({ title: "Today", data: groups["Today"] });
    if (groups["This Week"]) sectionArray.push({ title: "This Week", data: groups["This Week"] });

    Object.keys(groups)
      .filter((k) => k !== "Today" && k !== "This Week")
      .sort((a, b) => new Date(groups[b][0].In).getTime() - new Date(groups[a][0].In).getTime())
      .forEach((k) => sectionArray.push({ title: k, data: groups[k] }));

    return sectionArray;
  };




  useEffect(() => {
    const fetchUser = async () => {
      try {
        // For logged-in user
        const user = await getProfile();
        setCurrentUser(user);
      } catch (err) {
        console.error("Failed to fetch user profile:", err);
      }
    };

    fetchUser();
  }, []);


  useEffect(() => {
    const fetchSchedules = async () => {
      if (!currentUser?._id) return;

      const monthSchedules = await getMonthlySchedules({
        userId: currentUser._id,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });

      setSchedules(monthSchedules);

      const grouped = groupSchedulesByWeek(monthSchedules);
      setSections(grouped);
    };

    fetchSchedules();
  }, [currentUser]);



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
            <Text style={styles.summaryValue}>{totalToText(todayTotal)}</Text>
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
            <Text style={styles.summaryValue}>{monthTotal.text}</Text>
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
          sections={visibleSections.slice(0, limit * page)} // show records up to page × limit
          keyExtractor={(item, index) =>
            item.id ? `${item.id}-${index}` : `${item.In}-${item.Out}-${index}`
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          renderSectionHeader={({ section }) =>
            section.data.length > 0 ? (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            ) : null
          }
          renderItem={({ item, index }) => {
            const itemBranchId =
              normalizeBranchIdValue(item.branch_id ?? item.branch ?? item.branchId ?? item.branchId) ??
              normalizeBranchIdValue(item?.branch);

            const loggedBranchId = normalizeBranchIdValue(
              currentUser?.branch
            );

            const showBranchInfo = !!(itemBranchId && loggedBranchId && itemBranchId !== loggedBranchId);
            const branchName = item.branch?.name || (itemBranchId ? branchNames[itemBranchId] : "Unknown Branch");
            const branchAddress =
              (itemBranchId && branchAddresses[itemBranchId]) ||
              (item.branch?.latitude && item.branch?.longitude
                ? `${item.branch.latitude}, ${item.branch.longitude}`
                : "Address not available");

            const inDate = item.In ? new Date(item.In) : null;
            const outDate = item.Out ? new Date(item.Out) : null;

            const inTimeText = inDate
              ? inDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
              : "--:--";
            const outTimeText = outDate
              ? outDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
              : "Work in progress";

            const timeText = `${inTimeText} - ${outTimeText}`;

            const durationText =
              inDate && outDate
                ? calcDuration(
                  `${String(inDate.getHours()).padStart(2, "0")}:${String(inDate.getMinutes()).padStart(
                    2,
                    "0"
                  )}:${String(inDate.getSeconds()).padStart(2, "0")}`,
                  `${String(outDate.getHours()).padStart(2, "0")}:${String(outDate.getMinutes()).padStart(
                    2,
                    "0"
                  )}:${String(outDate.getSeconds()).padStart(2, "0")}`
                ).text
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
                  {new Date(item.In).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "2-digit",
                  })}
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
            const totalItems = sections.reduce((sum, s) => sum + s.data.length, 0);
            const visibleItems = page * limit;

            if (visibleItems < totalItems && !loadingMore) {
              setLoadingMore(true);
              // simulate short delay if needed or call API
              await new Promise(resolve => setTimeout(resolve, 400));
              setPage(prev => prev + 1);
              setLoadingMore(false);
            }
          }}
          onEndReachedThreshold={0.2}
          ListFooterComponent={() => {
            const totalItems = sections.reduce((sum, s) => sum + s.data.length, 0);
            const visibleItems = page * limit;

            if (loadingMore) {
              return (
                <ActivityIndicator
                  style={{ marginVertical: 16 }}
                  size="small"
                  color={colors.primary}
                />
              );
            }

            if (visibleItems < totalItems) {
              // Empty space before spinner shows up
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
    paddingHorizontal: 20
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  summaryLabel: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
    fontFamily: fonts.family.regular,
    color: colors.search,
    minHeight: 16,
    marginBottom: 10,
  },
  summaryValue: {
    fontSize: fonts.size.xxl,
    fontWeight: fonts.weight.medium as any,
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
    fontWeight: fonts.weight.regular as any,
    fontFamily: fonts.family.regular,
    color: colors.text,
  },
  sectionTitle: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
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
    fontWeight: fonts.weight.regular as any,
    fontFamily: fonts.family.regular,
    color: colors.text,
    minHeight: 16,
  },
  durationText: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.medium as any,
    fontFamily: fonts.family.regular,
    color: colors.primary,
    minHeight: 16,
  },
  dateText: {
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.medium as any,
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
  branchInfo: {
    flexDirection: "row"
  },
  branchName: {
    fontSize: fonts.size.m,
    fontFamily: fonts.family.regular,
    fontWeight: fonts.weight.regular as any,
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
    fontWeight: fonts.weight.regular as any,
    color: colors.subtext2,
    lineHeight: 14,
    maxWidth: "60%"
  },
});


