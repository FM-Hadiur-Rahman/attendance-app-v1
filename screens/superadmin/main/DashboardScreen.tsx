// screens/superadmin/main/DashboardScreen.tsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Image,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '../../../styles/Colors';
import Header from '../../../components/Header';
import Popup from '../../../components/Popup';
import { Button1 } from '../../../components/Button';
import { useNavigation, useRoute, NavigationProp, RouteProp } from '@react-navigation/native';
import fonts from '../../../styles/Fonts';

// API (typed)
import { getUsers, ProfileUser } from '../../../api/profile';
import { getAllBranches, Branch } from '../../../api/Branchs';
import { getSchedulesForDate, ScheduleItem } from '../../../api/schedules';
import { clearAllAuthData } from '../../../api/auth/authToken';
import {
  getCurrentShiftUsers,
  AttendanceHistoryItem,
} from '../../../api/attendanceAllHistory';
import { logout as apiLogout } from '../../../api/auth/authService';
import translations from '../../../assets/translations.json';
import CartBox from '../../../components/CartBox';

const { width: deviceWidth } = Dimensions.get('window');
const base = deviceWidth / 440;

type LangId = keyof typeof translations;

// Navigation typing (small subset used by this screen)
type RootStackParamList = {
  AttendanceScreen: {
    branch_id: string;
    userId?: string;
    langId?: LangId;
    branch_name?: string;
  };
  LoginScreen: { langId?: LangId };
};

// Cache keys
const CACHE_KEYS = {
  branches: 'dashboard_branches_v1',
  users: 'dashboard_users_v1',
  schedules: (dateYMD: string) => `dashboard_schedules_${dateYMD}_v1`,
  ts: 'dashboard_cache_ts_v1',
};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type Props = { userId?: string; langId?: LangId };

const DashboardScreen: React.FC<Props> = (props) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<Record<string, object>, string>>();

  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeParams = (route.params ?? {}) as { userId?: string; langId?: LangId };
  const routeUserId = routeParams.userId;
  const userId = propUserId ?? routeUserId;

  const routeLangId = routeParams.langId;
  const initialLang = (propLangId ?? routeLangId ?? 'en') as LangId;

  const [selectedLanguage] = useState<LangId>(initialLang);
  const [logoutPopupVisible, setLogoutPopupVisible] = useState(false);
  const lang = translations[selectedLanguage];

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // server data states
  const [usersState, setUsersState] = useState<ProfileUser[]>([]);
  const [branchesState, setBranchesState] = useState<Branch[]>([]);
  const [schedulesState, setSchedulesState] = useState<ScheduleItem[]>([]);

  // small loading flags for specific data so we can show "..." while numbers load
  const [usersLoading, setUsersLoading] = useState<boolean>(false);
  const [schedulesLoading, setSchedulesLoading] = useState<boolean>(false);

  // attendance (current shift) counts
  const [attendanceLoading, setAttendanceLoading] = useState<boolean>(false);
  const [branchAttendanceCounts, setBranchAttendanceCounts] = useState<Record<string, number>>({});
  const [totalAttendanceCount, setTotalAttendanceCount] = useState<number>(0);


  const cacheClearIntervalRef = useRef<number | null>(null);

  // helpers for date -> YMD
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  // today's date in local timezone (Y-M-D)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYMD = toYMD(today);

  // ------------------ Cache helpers ------------------
  const saveCache = async (key: string, value: unknown) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
      await AsyncStorage.setItem(CACHE_KEYS.ts, String(Date.now()));
    } catch (e) {
      console.warn('saveCache failed', e);
    }
  };
  const loadCache = async <T = unknown>(key: string): Promise<T | null> => {
    try {
      const json = await AsyncStorage.getItem(key);
      if (!json) return null;
      return JSON.parse(json) as T;
    } catch (e) {
      console.warn('loadCache failed', e);
      return null;
    }
  };
  const clearAllDashboardCache = async () => {
    try {
      await AsyncStorage.removeItem(CACHE_KEYS.branches);
      await AsyncStorage.removeItem(CACHE_KEYS.users);
      await AsyncStorage.removeItem(CACHE_KEYS.ts);
      // remove schedules for today key specifically
      await AsyncStorage.removeItem(CACHE_KEYS.schedules(todayYMD));
    } catch (e) {
      console.warn('clearAllDashboardCache failed', e);
    }
  };

  // ------------------ Attendance helpers ------------------
  /**
   * Compute counts per branch from AttendanceHistoryItem[]
   * Only records that are currently on shift are passed in (no Out present)
   */
  const computeAttendanceCounts = (records: AttendanceHistoryItem[]) => {
    const counts: Record<string, number> = {};

    records.forEach((rec) => {
      // Ignore records without In or with Out (getCurrentShiftUsers already filtered by this, defensive here)
      if (!rec.In) return;
      if (rec.Out) return;

      // branch id resolution using only fields our API types define
      let branchId: string | null = null;
      if (rec.branch && typeof rec.branch === 'object') {
        branchId = rec.branch._id ?? '';
      }
      if (!branchId && typeof rec.branch_id === 'string') {
        branchId = rec.branch_id;
      }

      if (!branchId) return;

      counts[branchId] = (counts[branchId] || 0) + 1;
    });

    const total = Object.values(counts).reduce((s, v) => s + (v || 0), 0);
    return { counts, total } as { counts: Record<string, number>; total: number };
  };

  const fetchAttendanceCounts = async () => {
    setAttendanceLoading(true);
    try {
      // Use API helper that returns users currently on shift (includes yesterday-night check-ins)
      const currentShift = await getCurrentShiftUsers();
      const { counts, total } = computeAttendanceCounts(currentShift ?? []);
      setBranchAttendanceCounts(counts);
      setTotalAttendanceCount(total);
    } catch (e) {
      console.warn('fetchAttendanceCounts failed', e);
      setBranchAttendanceCounts({});
      setTotalAttendanceCount(0);
    } finally {
      setAttendanceLoading(false);
    }
  };

  // ------------------ Data loading & cache strategy ------------------
  const loadDataFromBackend = async () => {
    try {
      // 1) Fetch branches first (so UI can render branch cards immediately)
      const branchesRes = await getAllBranches();
      setBranchesState(branchesRes ?? []);
      saveCache(CACHE_KEYS.branches, branchesRes ?? []);

      // 2) Kick off users + schedules in parallel (they can take longer)
      setUsersLoading(true);
      setSchedulesLoading(true);

      const [usersRes, schedulesRes] = await Promise.all([
        getUsers({ limit: 1000 }).catch((e) => {
          console.warn('getUsers failed', e);
          return null;
        }),
        getSchedulesForDate(todayYMD).catch((e) => {
          console.warn('getSchedulesForDate failed', e);
          return null;
        }),
      ]);

      if (usersRes) {
        setUsersState(usersRes);
        saveCache(CACHE_KEYS.users, usersRes);
      }

      if (schedulesRes) {
        setSchedulesState(schedulesRes);
        saveCache(CACHE_KEYS.schedules(todayYMD), schedulesRes);
      }
    } catch (e) {
      console.warn('loadDataFromBackend failed', e);
    } finally {
      // clear the granular loading flags
      setUsersLoading(false);
      setSchedulesLoading(false);

      // update attendance counts (depends on attendance API) — do it after we've attempted to load schedules/users
      fetchAttendanceCounts().catch((err) => console.warn('fetchAttendanceCounts failed', err));
    }
  };

  const loadData = async (opts: { forceReload?: boolean } = {}) => {
    setLoading(true);
    try {
      const now = Date.now();
      const tsRaw = await AsyncStorage.getItem(CACHE_KEYS.ts);
      const ts = tsRaw ? Number(tsRaw) : 0;
      const cacheValid = !opts.forceReload && ts && now - ts < CACHE_TTL_MS;

      if (cacheValid) {
        // Load from cache quickly so UI shows something fast
        const [branchesCached, usersCached, schedulesCached] = await Promise.all([
          loadCache<Branch[]>(CACHE_KEYS.branches),
          loadCache<ProfileUser[]>(CACHE_KEYS.users),
          loadCache<ScheduleItem[]>(CACHE_KEYS.schedules(todayYMD)),
        ]);

        if (branchesCached) setBranchesState(branchesCached);
        if (usersCached) setUsersState(usersCached);
        if (schedulesCached) setSchedulesState(schedulesCached);

        // always refresh attendance counts from backend (to reflect checkouts)
        fetchAttendanceCounts().catch((e) => console.warn(e));

        // Immediately refresh branches (fast) and then load users/schedules in background.
        // This ensures branch names/cards appear quickly and navigation is possible.
        getAllBranches()
          .then((b) => {
            if (b) {
              setBranchesState(b);
              saveCache(CACHE_KEYS.branches, b);
            }
          })
          .catch((e) => console.warn('background getAllBranches failed', e));

        // Kick off background refresh of users + schedules (non-blocking)
        loadDataFromBackend().catch((e) => console.warn('background reload failed', e));
      } else {
        // no valid cache -> load from backend (this will set branches first then others)
        await loadDataFromBackend();
      }
    } catch (err) {
      console.warn('Dashboard loadData failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // initial load
    loadData();

    // set up periodic cache clear every 5 minutes
    cacheClearIntervalRef.current = setInterval(() => {
      clearAllDashboardCache().catch((e) => console.warn('periodic cache clear failed', e));
    }, CACHE_TTL_MS) as unknown as number;

    return () => {
      if (cacheClearIntervalRef.current) {
        clearInterval(cacheClearIntervalRef.current as unknown as number);
        cacheClearIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      // clear cache and force reload from backend
      await clearAllDashboardCache();
      await loadData({ forceReload: true });
    } catch (err) {
      console.warn('Refresh failed', err);
    } finally {
      setRefreshing(false);
    }
  };

  // ------------------ Schedule / user utilities ------------------
  // Utility: check whether a schedule entry corresponds to a user with role === 'user'
  const scheduleIsUser = (s: ScheduleItem) => {
    if (!s.employee_id) return false;

    // employee_id may be string (id) or object defined in ScheduleItem
    if (typeof s.employee_id === 'object' && s.employee_id !== null) {
      return s.employee_id.role === 'user';
    }

    // fallback: find user in usersState
    const empId = String(s.employee_id);
    const found = usersState.find((u) => u._id === empId);
    return found?.role === 'user';
  };

  // Staff on shift today (unique user count where schedule date == today and employee role === 'user')
  const todaysUniqueStaffCount = useMemo(() => {
    const setIds = new Set<string>();
    schedulesState.forEach((s) => {
      if (!scheduleIsUser(s)) return;
      const uid = typeof s.employee_id === 'object' && s.employee_id !== null ?
        s.employee_id._id : s.employee_id;
      if (uid) setIds.add(String(uid));
    });
    return setIds.size;
  }, [schedulesState, usersState]);

  // Per-branch counts (from schedules)
  const branchCounts = useMemo(() => {
    return branchesState.map((branch) => {
      const branchId = branch._id;

      // total employees in branch (only role === 'user')
      const totalEmployees = usersState.filter((u) => {
        if (u.role !== 'user') return false;
        // profile.user.branch is defined as string in ProfileUser type
        return u.branch === branchId;
      }).length;

      // unique users scheduled today for this branch (only role === 'user')
      const workingSet = new Set<string>();
      schedulesState.forEach((s) => {
        // schedule must be of today already since schedulesState is filtered by today
        // check branch match
        const sBranchId = typeof s.branch_id === 'object' && s.branch_id !== null ? s.branch_id._id : s.branch_id;
        if (!sBranchId) return;
        if (String(sBranchId) !== String(branchId)) return;
        if (!scheduleIsUser(s)) return;
        const uid = typeof s.employee_id === 'object' && s.employee_id !== null ? s.employee_id._id : s.employee_id;
        if (uid) workingSet.add(String(uid));
      });

      const todayWorking = workingSet.size;

      return {
        branchId,
        branchName: branch.name ?? '—',
        totalEmployees,
        todayWorking,
      };
    });
  }, [branchesState, usersState, schedulesState]);

  // ------------------ Rendering ------------------
  return (
    <View style={styles.container}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        left={{
          type: 'image',
          url: require('../../../assets/icons/logout_b.png'),
          width: 19,
          height: 19,
          onPress: () => setLogoutPopupVisible(true),
        }}
        center={{ type: 'text', value: lang.Dashboard, color: colors.text }}
      />

      <View style={styles.body}>
        <View style={styles.boxes}>
          <CartBox containerStyle={styles.staff}>
            <View style={styles.total_staff_icon}>
              <Image source={require('../../../assets/icons/totalstaff_b.png')} style={styles.icon} />
              <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}> {lang.total_staff}</Text>
            </View>
            <Text style={styles.total_count}>
              {schedulesLoading ? '...' : String(todaysUniqueStaffCount)}
            </Text>

          </CartBox>

          <CartBox containerStyle={styles.staff}>
            <View style={styles.total_staff_icon}>
              <Image source={require('../../../assets/icons/staff_tik_g.png')} style={styles.icon} />
              <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}>{lang.staff_on_shift}</Text>
            </View>
            <Text style={styles.shift_count} ellipsizeMode="tail" numberOfLines={1}>
              {attendanceLoading ? '...' : totalAttendanceCount}
            </Text>
          </CartBox>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            style={{ marginBottom: 0 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              colors={[colors.primary]} tintColor={colors.primary} />}
          >
            <View style={styles.all_branches}>
              {branchCounts.map((b) => (
                <TouchableOpacity
                  key={b.branchId}
                  onPress={() => {
                    const navParams = {
                      branch_id: b.branchId,
                      userId,
                      langId: selectedLanguage,
                      branch_name: b.branchName,
                    };
                    navigation.navigate('AttendanceScreen', navParams);
                  }}
                >
                  <CartBox containerStyle={styles.branch}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', width: '90%' }}>
                      <Image source={require('../../../assets/icons/branch_b_withbg.png')} style={styles.icon} />
                      <Text style={styles.branch_name} ellipsizeMode="tail" numberOfLines={1}>{b.branchName}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                      <Text style={styles.count}>{attendanceLoading ? '...' : String(branchAttendanceCounts[b.branchId] ?? 0)}</Text>
                      <Text style={styles.count}>/</Text>
                      <Text style={styles.count}>{schedulesLoading ? '...' : String(b.todayWorking)}</Text>
                    </View>
                  </CartBox>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      <Popup visible={logoutPopupVisible} 
      onClose={() => setLogoutPopupVisible(false)} 
      popupBorderColor={colors.error_text} 
      dismissOnOverlayPress={false} title={lang.Logout} 
      titleStyle={{ color: colors.error_text }}>
        <Text style={styles.popupsubtext}>{lang.logout_confirm}</Text>
        <View style={styles.button_group}>
          <Button1
            text={lang.yes}
            onPress={async () => {
              setLogoutPopupVisible(false);
              try {
                await apiLogout();
              } catch (err) {
                console.warn('apiLogout() failed (ignored):', err);
              }
              try {
                await clearAllAuthData();
              } catch (err) {
                console.warn('Failed to clear auth data on logout:', err);
              }
              navigation.reset({ index: 0, routes: [{ name: 'LoginScreen', params: { langId: selectedLanguage } }] });
            }}
            backgroundColor={colors.primary}
            width={'48%'}
            textStyle={{ color: colors.secondary }}
          />
          <Button1 text={lang.no}
            onPress={() => setLogoutPopupVisible(false)}
            backgroundColor={colors.error_text}
            width={'48%'}
            textStyle={{ color: colors.secondary }} />
        </View>
      </Popup>
    </View>
  );
};

export default DashboardScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  popupsubtext: {
    color: colors.subtext,
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular,
    marginBottom: 30,
    alignSelf: 'center',
  },
  body: {
    marginTop: 20,
    marginHorizontal: 20,
    flex: 1,
  },
  boxes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  icon: {
    width: 30 * base,
    height: 30,
  },
  total_staff: {
    color: colors.search,
    fontWeight: fonts.weight.regular,
    fontSize: 14,
    marginLeft: 8,
    width: '75%',
  },
  total_count: {
    fontWeight: fonts.weight.medium,
    fontSize: fonts.size.xxl,
    color: colors.primary,
    marginTop: 8,
  },
  shift_count: {
    fontWeight: fonts.weight.medium,
    fontSize: fonts.size.xxl,
    color: colors.text,
    marginTop: 8,
  },
  staff: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border1,
    width: 190 * base,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    alignItems: 'flex-start',
  },
  all_branches: {},
  branch: {
    alignItems: 'flex-start',
    paddingTop: 12,
    paddingLeft: 12,
    paddingBottom: 12,
    marginBottom: 12,
    borderRadius: 10,
  },
  branch_name: {
    marginLeft: 10,
    color: colors.subtext2,
    fontSize: fonts.size.m,
    fontWeight: fonts.weight.regular,
  },
  count: {
    color: colors.primary,
    fontSize: fonts.size.xxl,
    fontWeight: fonts.weight.medium,
  },
  total_staff_icon: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  loading: {
    flex: 1, justifyContent: 'center', alignItems: 'center'
  },
  button_group:{ 
    flexDirection: 'row', justifyContent: 'space-between', width: '100%' 
  },
});
