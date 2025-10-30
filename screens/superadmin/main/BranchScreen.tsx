// src/screens/BranchScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Image,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlatList } from 'react-native';
import colors from '../../../styles/Colors';
import Header from '../../../components/Header';
import translations from '../../../assets/translations.json';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Button1 } from '../../../components/Button';
import CartBox from '../../../components/CartBox';
import fonts from '../../../styles/Fonts';
import { getBranches, Branch } from '../../../api/Branchs'
import { getManagersByBranch } from '../../../api/profile';
import Toast, { showSuccessToast, toastConfig } from '../../../components/Toast'; // adjust path if needed
import { TouchableOpacity } from 'react-native';
// --- constants for caching & batching ---
const GEO_CACHE_KEY = 'branch_geo_cache_v1'; // AsyncStorage key (simple JSON map)
const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BATCH_SIZE = 5; // number of parallel geocode calls at once

const BranchScreen: React.FC = (props: any) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;
  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || 'en';
  const lang = (translations as any)[langId] || (translations as any)['en'];

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
          console.warn('Failed to show success toast on BranchScreen', e);
        }
      }
      // also refresh data when focused
      fetchData();
      return () => { };
    }, [route.params?.toastMessage, fetchData])
  );


  const [branches, setBranches] = useState<Branch[]>([]);
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
      return {};
    }
  };

  const writeGeoCache = async (map: Record<string, any>) => {
    try {
      await AsyncStorage.setItem(GEO_CACHE_KEY, JSON.stringify(map));
    } catch (e) {
      // swallow
    }
  };

  // --- geocode once (no caching) with safer headers and timeout fallback ---
  const geocodeOnce = async (lat: number, lon: number): Promise<string> => {
    // Nominatim etc. may fail; return lat,lon fallback on any failure
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
      // small timeout helper
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mr-Baker-App/1.0 (your-email@example.com)',
          Accept: 'application/json',
        },
      });
      clearTimeout(timeout);
      if (!res.ok) {
        // fallback to coords string
        return `${lat}, ${lon}`;
      }
      const json = await res.json();
      return (json?.display_name as string) || `${lat}, ${lon}`;
    } catch (e) {
      // network error, timeout, or abort
      return `${lat}, ${lon}`;
    }
  };

  // --- geocode with local AsyncStorage cache + TTL ---
  // (replace your existing geocodeWithCache with this)
  const geocodeWithCache = async (branchId: string, lat?: number, lon?: number) => {
    if (lat == null || lon == null) return undefined;
    try {
      const cache = await readGeoCache();
      const existing = cache[branchId];
      const now = Date.now();

      // If cache exists, ensure it matches current coordinates AND is fresh
      if (existing && existing.lat != null && existing.lon != null) {
        const cachedLat = Number(existing.lat);
        const cachedLon = Number(existing.lon);

        const coordsMatch = Number(cachedLat) === Number(lat) && Number(cachedLon) === Number(lon);

        // if coords match and not stale -> return cached address
        if (coordsMatch && existing.savedAt && (now - existing.savedAt < GEO_CACHE_TTL_MS)) {
          return existing.addr;
        }
        // if coords don't match OR cache is stale -> we'll re-geocode and replace below
      }

      // Not cached, coords changed, or cache stale -> perform geocode
      const addr = await geocodeOnce(lat, lon);

      // store back to cache (overwrite or create)
      cache[branchId] = { addr, lat, lon, savedAt: now };
      await writeGeoCache(cache);

      return addr;
    } catch (e) {
      // fallback to simple coords if anything goes wrong
      return `${lat}, ${lon}`;
    }
  };

  // --- fetchData with batch geocoding ---
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBranches({ page: 1, limit: 100 });
      const fetchedBranches = res?.branches ?? [];

      // get managers map from API helper
      const map = await getManagersByBranch({ limit: 1000 });
      setManagersByBranch(map);

      // Prepare array of branches that need geocode (branchId + coords)
      const toGeocode: Array<{ idx: number; branchId: string; lat?: number; lon?: number }> = [];
      fetchedBranches.forEach((b: Branch, i: number) => {
        const coords = b?.location?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          const lon = Number(coords[0]);
          const lat = Number(coords[1]);
          toGeocode.push({ idx: i, branchId: b._id ?? b.id ?? String(i), lat, lon });
        }
      });

      // geocode in small batches to avoid throttle
      const resultsAddr: Record<string, string> = {};
      for (let i = 0; i < toGeocode.length; i += BATCH_SIZE) {
        const batch = toGeocode.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (item) => {
          const cached = await geocodeWithCache(item.branchId, item.lat, item.lon);
          resultsAddr[item.branchId] = cached ?? `${item.lat}, ${item.lon}`;
        });
        // await this batch then continue
        await Promise.all(promises);
      }

      // attach readableAddress to branches
      const branchesWithAddress = fetchedBranches.map((b: Branch) => {
        const branchId = b._id ?? b.id;
        const coords = b?.location?.coordinates;
        const fallback = coords && Array.isArray(coords) ? `${coords[1]}, ${coords[0]}` : 'undefined';
        const readableAddress = (branchId && (resultsAddr[branchId] ?? undefined)) ?? (b as any).readableAddress ?? fallback;
        return { ...b, readableAddress } as Branch & { readableAddress?: string };
      });

      setBranches(branchesWithAddress as any);
    } catch (e) {
      console.warn('fetchData failed', e);
      // keep UI graceful
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // note: reverseGeocode isn't used anymore but keep deps stable
  // initial + focus reload
  useFocusEffect(
    useCallback(() => {
      fetchData();
      return () => { };
    }, [fetchData])
  );

  // auto reload every 60s while screen focused
  useEffect(() => {
    // set up interval
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
        center={{ type: 'text', value: lang.Branch, color: colors.text }}
      />

      <View style={styles.body}>
        {loading && branches.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <FlatList
            data={branches}
            keyExtractor={(item: any) => (item._id ?? item.id ?? String(item.name ?? JSON.stringify(item)))}
            contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 0 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            renderItem={({ item: b }) => {
              const branchId = b._id ?? b.id;
              const manager = managersByBranch[branchId];
              const addressText = (b as any).readableAddress ??
                (b?.location?.coordinates && Array.isArray(b.location.coordinates)
                  ? `${b.location.coordinates[1]}, ${b.location.coordinates[0]}`
                  : 'undefined');

              // adminUserId: if your getManagersByBranch returns an id map, use that; else adapt.
              const adminUserId = managersByBranch[branchId]; // adjust if managersByBranch stores object { id, name }

              const handlePress = () => {
                const payload = {
                  branchId,
                  userId,            // param passed into this screen (computed at top)
                  adminUserId,
                  langId,            // computed earlier in this file
                  address: addressText,
                };
                console.log('Navigating to BranchProfileScreen with:', payload);
                // ensure the route name below matches your navigator registration
                navigation.navigate('BranchProfileScreen', payload);
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
                          source={require('../../../assets/icons/branch.png')}
                          style={styles.icon1}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.branchname} ellipsizeMode='tail' numberOfLines={1}>
                            {b.name ?? 'undefined'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.address}>
                        <Image
                          source={require('../../../assets/icons/location.png')}
                          style={styles.icon2}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.addresstext} ellipsizeMode='tail' numberOfLines={1}>
                            {addressText}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.address}>
                        <Image
                          source={require('../../../assets/icons/manager_gray.png')}
                          style={styles.icon2}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.addresstext} ellipsizeMode='tail' numberOfLines={1}>
                            {manager ?? 'undefined'}
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
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'center',
  },
  icon1: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  branchname: {
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular as any,
    color: colors.text,
  },
  details: {
    width: '95%'
  },
  address: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon2: {
    width: 14,
    height: 14,
    marginRight: 4,
  },
  addresstext: {
    color: colors.subtext2,
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular as any,
  },
});
