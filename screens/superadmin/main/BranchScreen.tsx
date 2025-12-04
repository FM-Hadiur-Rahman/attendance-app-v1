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
  Platform,
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
} from "@react-navigation/native";
import CartBox from "../../../components/CartBox";
import fonts from "../../../styles/Fonts";
import { getBranches, Branch } from "../../../api/Branchs";
import { getManagersByBranch } from "../../../api/profile";
import Toast, {
  showSuccessToast,
  toastConfig,
} from "../../../components/Toast";
import { TouchableOpacity } from "react-native";
// --- constants for caching & batching ---
const GEO_CACHE_KEY = "branch_geo_cache_v1"; // AsyncStorage key (simple JSON map)
const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BATCH_SIZE = 1; // Reduced to 1 to minimize concurrent requests
const INTER_BATCH_DELAY_MS = 2000; // 2s delay between each request (conservative for rate limits)

const BranchScreen: React.FC = (props: any) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const propUserId = props.userId;
  const propLangId = props.langId;
  const routeUserId = route.params.userId;
  const routeLangId = route.params.langId;
  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || "en";
  const lang = (translations as any)[langId] || (translations as any)["en"];

  const [branches, setBranches] = useState<Branch[]>([]);
  const [managersByBranch, setManagersByBranch] = useState<
    Record<string, string | undefined>
  >({});
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
      // swallow
    }
  };

  // Enhanced geocodeOnce with more retries, longer delays, and better error handling
  const geocodeOnce = async (lat: number, lon: number): Promise<string> => {
    const tryReverse = async (
      latArg: number,
      lonArg: number,
      attempt: number = 1
    ): Promise<string | null> => {
      // Validate coords roughly (lat -90..90, lon -180..180)
      if (latArg < -90 || latArg > 90 || lonArg < -180 || lonArg > 180) {
        console.warn(
          `Invalid coords for attempt ${attempt}: lat=${latArg}, lon=${lonArg}`
        );
        return null;
      }

      try {
        // CRITICAL: Replace with your actual support email! Nominatim requires a valid contact email in User-Agent.
        const userAgent = "MrBakerApp/1.0 (your-real-email@domain.com)"; // <-- CHANGE THIS IMMEDIATELY
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latArg}&lon=${lonArg}&addressdetails=1&accept-language=${langId}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased to 15s

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
            // Rate limit or server error, retry up to 3 times
            const retryDelay = 2000 * attempt; // Progressive: 2s, 4s, etc.
            console.warn(
              `Geocode HTTP ${status} on attempt ${attempt}, retrying in ${retryDelay / 1000}s...`
            );
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            return tryReverse(latArg, lonArg, attempt + 1);
          }
          console.warn(`Geocode failed with HTTP ${status}`);
          return null;
        }

        const json = (await res.json()) as any;
        let display = json?.display_name ?? null;
        if (!display && json?.address) {
          // Fallback to constructed address if display_name missing
          const addrParts = [];
          if (json.address.road) addrParts.push(json.address.road);
          if (json.address.suburb || json.address.hamlet)
            addrParts.push(json.address.suburb || json.address.hamlet);
          if (json.address.city || json.address.town || json.address.village)
            addrParts.push(
              json.address.city || json.address.town || json.address.village
            );
          if (json.address.state_district)
            addrParts.push(json.address.state_district);
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
            const retryDelay = 3000 * attempt; // Longer for timeout: 3s, 6s
            console.warn(`Retrying timeout in ${retryDelay / 1000}s...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            return tryReverse(latArg, lonArg, attempt + 1);
          }
        } else if (
          e.message?.includes("Network") ||
          e.message?.includes("Failed to fetch")
        ) {
          console.warn(
            `Geocode network error on attempt ${attempt}: ${e.message}`
          );
          if (attempt < 2) {
            // Fewer retries for network, as it may persist
            await new Promise((resolve) => setTimeout(resolve, 5000)); // 5s for network
            return tryReverse(latArg, lonArg, attempt + 1);
          }
        } else {
          console.warn(`Geocode unexpected error on attempt ${attempt}:`, e);
        }
        return null;
      }
    };

    // Primary: standard lat, lon
    let primary = await tryReverse(lat, lon);
    if (primary) {
      console.log(`Geocoded primary (${lat}, ${lon}) -> ${primary}`);
      return primary;
    }

    // Secondary: swapped (for DB inconsistencies)
    console.log(`Primary failed, trying swapped for (${lat}, ${lon})`);
    let swapped = await tryReverse(lon, lat);
    if (swapped) {
      console.warn(
        `Geocoded with swap (${lat}, ${lon}) -> (${lon}, ${lat}) -> ${swapped}`
      );
      return swapped;
    }

    // Final fallback
    const fallback = `${Math.round(lat * 10000) / 10000}, ${Math.round(lon * 10000) / 10000}`;
    console.warn(
      `All geocoding attempts failed for (${lat}, ${lon}), using fallback: ${fallback}`
    );
    return fallback;
  };

  // --- geocode with local AsyncStorage cache + TTL ---
  const geocodeWithCache = async (
    branchId: string,
    lat?: number,
    lon?: number
  ) => {
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
      console.warn(
        `Invalid coords for branch ${branchId}: lat=${lat}, lon=${lon}`
      );
      return "Invalid location";
    }

    try {
      const cache = await readGeoCache();
      const existing = cache[branchId];
      const now = Date.now();

      // Check cache: coords match AND fresh AND not fallback coords string
      if (existing?.lat != null && existing?.lon != null && existing.savedAt) {
        const cachedLat = Number(existing.lat);
        const cachedLon = Number(existing.lon);
        const coordsMatch =
          Math.abs(cachedLat - lat) < 0.0001 &&
          Math.abs(cachedLon - lon) < 0.0001;

        const isStale = now - existing.savedAt >= GEO_CACHE_TTL_MS;
        const isFallback =
          typeof existing.addr === "string" &&
          /^\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\s*$/.test(existing.addr);

        if (coordsMatch && !isStale && !isFallback) {
          console.log(`Cache hit for ${branchId}: ${existing.addr}`);
          return existing.addr;
        }
      }

      // Miss: geocode fresh
      console.log(`Geocoding fresh ${branchId} (${lat}, ${lon})`);
      const addr = await geocodeOnce(lat, lon);

      // Update cache (even fallbacks, but we'll re-try next time if fallback)
      cache[branchId] = {
        addr,
        lat: String(lat),
        lon: String(lon),
        savedAt: now,
      };
      await writeGeoCache(cache);

      return addr;
    } catch (e) {
      console.warn(`geocodeWithCache error for ${branchId}:`, e);
      return `${Math.round(lat * 10000) / 10000}, ${Math.round(lon * 10000) / 10000}`;
    }
  };

  // --- fetchData with sequential geocoding (no real batches, just sequential with delays) ---
  const fetchData = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      const res = await getBranches({ page: 1, limit: 100 });
      const fetchedBranches = res?.branches ?? [];

      // get managers map from API helper
      const map = await getManagersByBranch({ limit: 1000 });
      setManagersByBranch(map);

      // Prepare array of branches that need geocode
      const toGeocode: Array<{
        idx: number;
        branchId: string;
        lat?: number;
        lon?: number;
      }> = [];
      fetchedBranches.forEach((b: Branch, i: number) => {
        const coords = b?.location?.coordinates;
        if (
          Array.isArray(coords) &&
          coords.length >= 2 &&
          !isNaN(Number(coords[0])) &&
          !isNaN(Number(coords[1]))
        ) {
          const lon = Number(coords[0]);
          const lat = Number(coords[1]);
          // Quick validation: if lat/lon out of bounds, skip or swap? But let geocodeOnce handle
          if ((lat >= -90 && lat <= 90) || (lon >= -90 && lon <= 90)) {
            // At least one plausible
            toGeocode.push({
              idx: i,
              branchId: b._id ?? b.id ?? String(i),
              lat,
              lon,
            });
          }
        }
      });

      console.log(
        `Preparing to geocode ${toGeocode.length} branches sequentially`
      );

      // Sequential geocoding: one at a time with delay to avoid any rate issues
      const resultsAddr: Record<string, string> = {};
      for (let i = 0; i < toGeocode.length; i++) {
        const item = toGeocode[i];
        const addr = await geocodeWithCache(item.branchId, item.lat, item.lon);
        resultsAddr[item.branchId] =
          addr ?? `${item.lat?.toFixed(4)}, ${item.lon?.toFixed(4)}`;

        // Delay after each request (except last)
        if (i < toGeocode.length - 1) {
          console.log(
            `Delaying ${INTER_BATCH_DELAY_MS}ms before next geocode...`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, INTER_BATCH_DELAY_MS)
          );
        }
      }

      // attach readableAddress to branches
      const branchesWithAddress = fetchedBranches.map((b: Branch) => {
        const branchId = b._id ?? b.id;
        const coords = b?.location?.coordinates;
        const fallback =
          coords &&
          Array.isArray(coords) &&
          !isNaN(Number(coords[0])) &&
          !isNaN(Number(coords[1]))
            ? `${Number(coords[1]).toFixed(4)}, ${Number(coords[0]).toFixed(4)}`
            : "Location not available";
        const readableAddress = branchId
          ? (resultsAddr[branchId] ?? (b as any).readableAddress ?? fallback)
          : fallback;
        return { ...b, readableAddress } as Branch & {
          readableAddress?: string;
        };
      });

      setBranches(branchesWithAddress as any);
      console.log(
        "Data fetch complete, branches with addresses:",
        branchesWithAddress.length
      );
    } catch (e) {
      console.error("fetchData failed:", e);
      Alert.alert(
        "Error",
        "Failed to load branches. Please check your internet connection and try again.",
        [{ text: "Retry", onPress: () => fetchData() }, { text: "OK" }]
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, langId]); // Added deps for stability

  // initial + focus reload
  useFocusEffect(
    useCallback(() => {
      fetchData();
      return () => {};
    }, [fetchData])
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

  // inside BranchScreen component (after userId/langId declarations)
  useFocusEffect(
    useCallback(() => {
      // If AddBranchScreen passed toastMessage through navigation params, show it
      const msg = route.params?.toastMessage;
      if (msg) {
        try {
          showSuccessToast(msg);
          // clear it so it doesn't reappear each focus
          navigation.setParams({ toastMessage: undefined });
        } catch (e) {
          console.warn("Failed to show success toast on BranchScreen", e);
        }
      }
      // also refresh data when focused
      fetchData();
      return () => {};
    }, [route.params?.toastMessage, fetchData, navigation])
  );

  return (
    <View style={styles.screen}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: lang.Branch, color: colors.text }}
      />

      <View style={styles.body}>
        {loading && branches.length === 0 ? (
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={branches}
            keyExtractor={(item: any) =>
              item._id ?? item.id ?? String(item.name ?? JSON.stringify(item))
            }
            contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 0 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ListEmptyComponent={
              !loading ? (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    paddingVertical: 50,
                  }}
                >
                  <Text style={{ color: colors.subtext2, textAlign: "center" }}>
                    No branches found. Pull to refresh.
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item: b }) => {
              const branchId = b._id ?? b.id;
              const manager = managersByBranch[branchId];
              const addressText =
                (b as any).readableAddress ?? "Location not available";

              // adminUserId: if your getManagersByBranch returns an id map, use that; else adapt.
              const adminUserId = managersByBranch[branchId]; // adjust if managersByBranch stores object { id, name }

              const handlePress = () => {
                const payload = {
                  branchId,
                  userId, // param passed into this screen (computed at top)
                  adminUserId,
                  langId, // computed earlier in this file
                  address: addressText,
                };
                console.log("Navigating to BranchProfileScreen with:", payload);
                // ensure the route name below matches your navigator registration
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
                        <Image
                          source={require("../../../assets/icons/branch.png")}
                          style={styles.icon1}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={styles.branchname}
                            ellipsizeMode="tail"
                            numberOfLines={1}
                          >
                            {b.name ?? "undefined"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.address}>
                        <Image
                          source={require("../../../assets/icons/location.png")}
                          style={styles.icon2}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={styles.addresstext}
                            ellipsizeMode="tail"
                            numberOfLines={2}
                          >
                            {addressText}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.address}>
                        <Image
                          source={require("../../../assets/icons/manager_gray.png")}
                          style={styles.icon2}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={styles.addresstext}
                            ellipsizeMode="tail"
                            numberOfLines={1}
                          >
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
    marginBottom: 4, // added for better spacing
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
    flexShrink: 1, // allow text to shrink if too long
  },
});
