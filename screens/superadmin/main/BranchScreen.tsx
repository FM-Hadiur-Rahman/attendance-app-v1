// src/screens/BranchScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  Image,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FlatList } from "react-native";
import colors from "../../../styles/Colors";
import Header from "../../../components/Header";
import translations from "../../../assets/translations.json";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
  NavigationProp,
  RouteProp,
} from "@react-navigation/native";
import CartBox from "../../../components/CartBox";
import fonts from "../../../styles/Fonts";
import { getBranches, Branch, GetBranchesResponse } from "../../../api/Branchs";
import { getManagersByBranch } from "../../../api/profile";
import Toast, { showSuccessToast, toastConfig } from "../../../components/Toast";
import { TouchableOpacity } from "react-native";

// --- constants for caching & batching ---
const GEO_CACHE_KEY = "branch_geo_cache_v1"; // AsyncStorage key (simple JSON map)
const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const INTER_BATCH_DELAY_MS = 2000; // 2s delay between each request (conservative for rate limits)

// Navigation param typing for safer useNavigation/useRoute
type RootStackParamList = {
  BranchScreen: { toastMessage?: string; userId?: string; langId?: string } | undefined;
  BranchProfileScreen: {
    branchId: string;
    userId?: string;
    adminUserId?: string | null;
    langId?: string;
    address?: string;
  };
};

// Extended branch type that may include readableAddress
type ExtendedBranch = Branch & { readableAddress?: string };

// Props: optional userId/langId (keeps compatibility with previous usage)
const BranchScreen: React.FC<{ userId?: string; langId?: string }> = (props) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "BranchScreen">>();

  const propUserId = props.userId;
  const propLangId = props.langId;
  const routeUserId = route.params?.userId;
  const routeLangId = route.params?.langId;
  const userId = propUserId ?? routeUserId;
  const langId = propLangId ?? routeLangId ?? "en";
  const lang = (translations as Record<string, any>)[langId];

  const [branches, setBranches] = useState<ExtendedBranch[]>([]);
  const [managersByBranch, setManagersByBranch] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const autoReloadRef = useRef<number | null>(null);

  // --- helper: read/write cache map (branchId -> { addr, lat, lon, savedAt }) ---
  const readGeoCache = async (): Promise<Record<string, any>> => {
    try {
      const raw = await AsyncStorage.getItem(GEO_CACHE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, any>;
    } catch (e) {
      console.warn("Failed to read geo cache:", e);
      return {};
    }
  };

  const writeGeoCache = async (map: Record<string, any>) => {
    try {
      await AsyncStorage.setItem(GEO_CACHE_KEY, JSON.stringify(map));
    } catch (e) {
      console.warn("Failed to write geo cache:", e);
    }
  };

  // --------------------
  // geocode helpers (unchanged logic, typed)
  // --------------------
  const geocodeOnce = async (lat: number, lon: number): Promise<string> => {
    const tryReverse = async (
      latArg: number,
      lonArg: number,
      attempt: number = 1
    ): Promise<string | null> => {
      if (latArg < -90 || latArg > 90 || lonArg < -180 || lonArg > 180) {
        console.warn(`Invalid coords for attempt ${attempt}: lat=${latArg}, lon=${lonArg}`);
        return null;
      }

      try {
        const userAgent = "MrBakerApp/1.0 (your-real-email@domain.com)"; // <-- CHANGE THIS
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latArg}&lon=${lonArg}&addressdetails=1&accept-language=${langId}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "User-Agent": userAgent,
            Accept: "application/json",
            "Accept-Language": langId,
          },
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const status = res.status;
          if ((status === 429 || status >= 500) && attempt < 3) {
            const retryDelay = 2000 * attempt;
            console.warn(`Geocode HTTP ${status} on attempt ${attempt}, retrying in ${retryDelay / 1000}s...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            return tryReverse(latArg, lonArg, attempt + 1);
          }
          console.warn(`Geocode failed with HTTP ${status}`);
          return null;
        }

        const json = (await res.json()) as any;
        let display = json?.display_name ?? null;
        if (!display && json?.address) {
          const addrParts: string[] = [];
          if (json.address.road) addrParts.push(json.address.road);
          if (json.address.suburb || json.address.hamlet) addrParts.push(json.address.suburb || json.address.hamlet);
          if (json.address.city || json.address.town || json.address.village) addrParts.push(json.address.city || json.address.town || json.address.village);
          if (json.address.state_district) addrParts.push(json.address.state_district);
          if (json.address.country) addrParts.push(json.address.country);
          display = addrParts.join(", ");
        }
        if (display && display.length > 0) {
          return display;
        }
        return null;
      } catch (e: any) {
        if (e.name === "AbortError") {
          console.warn(`Geocode timeout on attempt ${attempt}`);
          if (attempt < 3) {
            const retryDelay = 3000 * attempt;
            console.warn(`Retrying timeout in ${retryDelay / 1000}s...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            return tryReverse(latArg, lonArg, attempt + 1);
          }
        } else if (e.message?.includes("Network") || e.message?.includes("Failed to fetch")) {
          console.warn(`Geocode network error on attempt ${attempt}: ${e.message}`);
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return tryReverse(latArg, lonArg, attempt + 1);
          }
        } else {
          console.warn(`Geocode unexpected error on attempt ${attempt}:`, e);
        }
        return null;
      }
    };

    // primary
    let primary = await tryReverse(lat, lon);
    if (primary) {
      console.log(`Geocoded primary (${lat}, ${lon}) -> ${primary}`);
      return primary;
    }

    // swapped
    console.log(`Primary failed, trying swapped for (${lat}, ${lon})`);
    let swapped = await tryReverse(lon, lat);
    if (swapped) {
      console.warn(`Geocoded with swap (${lat}, ${lon}) -> (${lon}, ${lat}) -> ${swapped}`);
      return swapped;
    }

    // fallback coords string
    const fallback = `${Math.round(lat * 10000) / 10000}, ${Math.round(lon * 10000) / 10000}`;
    console.warn(`All geocoding attempts failed for (${lat}, ${lon}), using fallback: ${fallback}`);
    return fallback;
  };

  const geocodeWithCache = async (branchId: string, lat?: number, lon?: number): Promise<string> => {
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
      console.warn(`Invalid coords for branch ${branchId}: lat=${lat}, lon=${lon}`);
      return "Invalid location";
    }

    try {
      const cache = await readGeoCache();
      const existing = cache[branchId];
      const now = Date.now();

      if (existing?.lat != null && existing?.lon != null && existing.savedAt) {
        const cachedLat = Number(existing.lat);
        const cachedLon = Number(existing.lon);
        const coordsMatch = Math.abs(cachedLat - lat) < 0.0001 && Math.abs(cachedLon - lon) < 0.0001;
        const isStale = now - existing.savedAt >= GEO_CACHE_TTL_MS;
        const isFallback = typeof existing.addr === "string" && /^\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\s*$/.test(existing.addr);

        if (coordsMatch && !isStale && !isFallback) {
          console.log(`Cache hit for ${branchId}: ${existing.addr}`);
          return existing.addr;
        }
      }

      console.log(`Geocoding fresh ${branchId} (${lat}, ${lon})`);
      const addr = await geocodeOnce(lat, lon);

      cache[branchId] = {
        addr,
        lat: String(lat),
        lon: String(lon),
        savedAt: now,
      };
      await writeGeoCache(cache);

      return addr ?? `${Math.round(lat * 10000) / 10000}, ${Math.round(lon * 10000) / 10000}`;
    } catch (e) {
      console.warn(`geocodeWithCache error for ${branchId}:`, e);
      return `${Math.round(lat * 10000) / 10000}, ${Math.round(lon * 10000) / 10000}`;
    }
  };

  // --- fetchData: branches first, render quickly, then managers & geocode update incrementally ---
  const fetchData = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      // 1) Get branches (fast) and render them with placeholder addresses
      const res: GetBranchesResponse = await getBranches({ page: 1, limit: 100 });
      const fetchedBranches: Branch[] = res.branches ?? [];

      const initialBranches: ExtendedBranch[] = fetchedBranches.map((b) => {
        const coords = b.location?.coordinates;
        // if coordinates missing, we'll show "Location not available" later
        const hasCoords = Array.isArray(coords) && coords.length >= 2 && !isNaN(Number(coords[0])) && !isNaN(Number(coords[1]));
        const fallback = hasCoords ? `${Number(coords[1]).toFixed(4)}, ${Number(coords[0]).toFixed(4)}` : lang.Location_not_available;
        return {
          ...b,
          // initially show '...' to indicate loading for addresses when coords present;
          // if coords absent, show fallback immediately
          readableAddress: hasCoords ? "loading..." : fallback,
        };
      });

      // render branches immediately
      setBranches(initialBranches);

      // 2) Fetch managers map (can be quick) — don't block UI
      getManagersByBranch({ limit: 1000 })
        .then((map) => {
          setManagersByBranch(map);
        })
        .catch((e) => {
          console.warn("getManagersByBranch failed", e);
        });

      // 3) Prepare geocoding list (only those with coords and currently placeholder '...')
      const toGeocode = initialBranches
        .map((b) => {
          const coords = b.location?.coordinates;
          if (!coords || !Array.isArray(coords) || coords.length < 2) return null;
          const lon = Number(coords[0]);
          const lat = Number(coords[1]);
          if (isNaN(lat) || isNaN(lon)) return null;
          if (b.readableAddress !== "loading...") return null; // skip if not placeholder
          return { branchId: b._id, lat, lon };
        })
        .filter((x): x is { branchId: string; lat: number; lon: number } => x !== null);

      // 4) Sequentially geocode and update branches incrementally
      for (let i = 0; i < toGeocode.length; i++) {
        const item = toGeocode[i];
        try {
          const addr = await geocodeWithCache(item.branchId, item.lat, item.lon);
          setBranches((prev) =>
            prev.map((pb) => (pb._id === item.branchId ? { ...pb, readableAddress: addr } : pb))
          );
        } catch (e) {
          console.warn(`Geocode failed for ${item.branchId}`, e);
          // mark with coords fallback
          const fallback = `${item.lat.toFixed(4)}, ${item.lon.toFixed(4)}`;
          setBranches((prev) =>
            prev.map((pb) => (pb._id === item.branchId ? { ...pb, readableAddress: fallback } : pb))
          );
        }

        // delay before next geocode to be gentle on rate limits
        if (i < toGeocode.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, INTER_BATCH_DELAY_MS));
        }
      }
    } catch (e) {
      console.error("fetchData failed:", e);
      Alert.alert("Error", "Please check your internet connection and try again.", [
        { text: "Retry", onPress: () => fetchData() },
        { text: "OK" },
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [langId]);

  // initial + focus reload and toast handling (single focus effect)
  useFocusEffect(
    useCallback(() => {
      // show toast if passed via params
      const msg = route.params?.toastMessage;
      if (msg) {
        try {
          showSuccessToast(msg);
          // clear it so it doesn't reappear each focus
          navigation.setParams({ toastMessage: undefined } as any);
        } catch (e) {
          console.warn("Failed to show success toast on BranchScreen", e);
        }
      }
      fetchData();
      return () => {};
    }, [fetchData, navigation, route.params])
  );

  // auto reload every 60s while screen focused
  useEffect(() => {
    const id = setInterval(() => {
      fetchData();
    }, 60000); // 60 seconds
    autoReloadRef.current = id as unknown as number;
    return () => {
      if (autoReloadRef.current) {
        clearInterval(autoReloadRef.current as unknown as number);
      }
      clearInterval(id);
    };
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  return (
    <View style={styles.screen}>
      <Header 
      backgroundColor={colors.secondary} 
      position="relative" 
      center={{ 
        type: "text", 
        value: lang.Branch, 
        color: colors.text }} />

      <View style={styles.body}>
        {loading && branches.length === 0 ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={branches}
            keyExtractor={(item) => String(item._id ?? item.name)}
            contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.loading}>
                  <Text style={{ color: colors.subtext2, textAlign: "center" }}>No branches found. Pull to refresh.</Text>
                </View>
              ) : null
            }
            renderItem={({ item: b }) => {
              const branchId = b._id;
              const manager = managersByBranch[branchId];
              const addressText = typeof b.readableAddress === "string" ? b.readableAddress : "...";

              const adminUserId = managersByBranch[branchId] ?? undefined;

              const handlePress = () => {
                const payload = {
                  branchId,
                  userId,
                  adminUserId,
                  langId,
                  address: addressText,
                };
                console.log("Navigating to BranchProfileScreen with:", payload);
                navigation.navigate("BranchProfileScreen", payload);
              };

              return (
                <TouchableOpacity activeOpacity={0.8} onPress={handlePress}>
                  <CartBox
                    key={branchId}
                    marginTop={2}
                    paddingLeft={10}
                    paddingRight={10}
                    borderRadius={12}
                    paddingTop={10}
                    paddingBottom={10}
                    marginBottom={10}
                    backgroundColor={colors.background}
                    alignItems="flex-start"
                  >
                    <View style={styles.details}>
                      <View style={styles.branch}>
                        <Image source={require("../../../assets/icons/branch.png")} style={styles.icon1} />
                        <View style={styles.name_group}>
                          <Text style={styles.branchname} ellipsizeMode="tail" numberOfLines={1}>
                            {b.name ?? "undefined"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.address}>
                        <Image source={require("../../../assets/icons/location.png")} style={styles.icon2} />
                        <View style={styles.name_group}>
                          <Text style={styles.addresstext} ellipsizeMode="tail" numberOfLines={2}>
                            {addressText}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.address}>
                        <Image source={require("../../../assets/icons/manager_gray.png")} style={styles.icon2} />
                        <View style={styles.name_group}>
                          <Text style={styles.addresstext} ellipsizeMode="tail" numberOfLines={1}>
                            {manager ?? "No manager assigned"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </CartBox>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
      <Toast config={toastConfig} />
    </View>
  );
};

export default BranchScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  body: {
    paddingHorizontal: 20,
    marginTop: 20,
    flex: 1,
  },
  branch: {
    flexDirection: "row",
    marginBottom: 6,
    alignItems: "center",
  },
  icon1: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  branchname: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
    color: colors.text,
  },
  details: {
    width: "95%",
  },
  address: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  icon2: {
    width: 14,
    height: 14,
    marginRight: 4,
    alignSelf: "flex-start",
  },
  addresstext: {
    color: colors.subtext2,
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular,
    flexShrink: 1,
  },
  loading:{
    flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 50 
  },
  name_group:{
    flex: 1
  },
  scroll:{
    paddingBottom: 20
  }
});
