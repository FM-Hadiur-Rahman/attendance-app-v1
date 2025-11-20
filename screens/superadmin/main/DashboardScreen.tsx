// screens/superadmin/main/DashboardScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
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
import colors from '../../../styles/Colors';
import Header from '../../../components/Header';
import Popup from '../../../components/Popup';
import { Button1 } from '../../../components/Button';
import { useNavigation, useRoute } from '@react-navigation/native';
import fonts from '../../../styles/Fonts';

// API
import { getUsers, ProfileUser } from '../../../api/profile';
import { getAllBranches, Branch } from '../../../api/Branchs';
import { getSchedulesForDate, ScheduleItem } from '../../../api/schedules';
import { clearAllAuthData } from '../../../api/auth/authToken';
import { getAttendanceAllHistory, AttendanceHistoryItem } from '../../../api/attendanceAllHistory';
import { logout as apiLogout } from '../../../api/auth/authService';
import translations from "../../../assets/translations.json";
import CartBox from '../../../components/CartBox';

const { width: deviceWidth } = Dimensions.get("window");
const base = deviceWidth / 440;

type LangId = keyof typeof translations; // "en" | "de"

const DashboardScreen = (props: any) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const propUserId = props?.userId;
  const propLangId = props?.langId;

  const routeUserId = route.params?.userId ?? route.params?.id;
  const userId = propUserId || routeUserId;

  const routeLangId = route.params?.langId ?? route.params?.language;
  const initialLang = (propLangId || routeLangId || "en") as LangId;

  const [selectedLanguage, setSelectedLanguage] = useState<LangId>(initialLang);
  const [tempLanguage, setTempLanguage] = useState<LangId>(selectedLanguage);
  const [logoutPopupVisible, setLogoutPopupVisible] = useState(false);

  const lang = translations[selectedLanguage];

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // server data states
  const [usersState, setUsersState] = useState<ProfileUser[]>([]);
  const [branchesState, setBranchesState] = useState<Branch[]>([]);
  const [schedulesState, setSchedulesState] = useState<ScheduleItem[]>([]);

  const [attendanceAll, setAttendanceAll] = useState<AttendanceHistoryItem[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState<boolean>(false);
  const [branchAttendanceCounts, setBranchAttendanceCounts] = useState<Record<string, number>>({});
  const [totalAttendanceCount, setTotalAttendanceCount] = useState<number>(0);

  // ADD these helper + fetch function

  const computeAttendanceCounts = (all: AttendanceHistoryItem[]) => {
    const counts: Record<string, number> = {};
    const now = Date.now();

    (all || []).forEach((a) => {
      const branchId = a.branch?.id ?? a.branch_id ?? null;
      if (!branchId) return;
      if (!a.In) return;

      // normalize and ensure same-day and not future
      const inDt = new Date(String(a.In).replace(' ', 'T'));
      const inYMD = toYMD(new Date(inDt.getFullYear(), inDt.getMonth(), inDt.getDate()));
      if (inYMD !== todayYMD) return;
      if (inDt.getTime() > now) return;

      counts[String(branchId)] = (counts[String(branchId)] || 0) + 1;
    });

    const total = Object.values(counts).reduce((s, v) => s + (v || 0), 0);
    return { counts, total };
  };

  const fetchAttendanceCounts = async () => {
    setAttendanceLoading(true);
    try {
      const all = await getAttendanceAllHistory();
      setAttendanceAll(all || []);
      const { counts, total } = computeAttendanceCounts(all || []);
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

  useEffect(() => {
    if (propLangId && propLangId !== selectedLanguage) {
      setSelectedLanguage(propLangId as LangId);
      setTempLanguage(propLangId as LangId);
    }
  }, [propLangId, selectedLanguage]);

  // helpers for date -> YMD
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  // today's date in local timezone (Y-M-D)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYMD = toYMD(today);

  const loadData = async () => {
    setLoading(true);
    try {
      // parallel fetch
      const [branchesRes, usersRes, schedulesRes] = await Promise.all([
        getAllBranches(),          // returns Branch[]
        getUsers({ limit: 1000 }), // returns ProfileUser[] (getUsers helper)
        getSchedulesForDate(todayYMD), // returns schedules for today (filtered)
      ]);

      setBranchesState(branchesRes ?? []);
      setUsersState(usersRes ?? []);
      setSchedulesState(schedulesRes ?? []);
      // <-- NEW: load attendance counts AFTER we've loaded branches/users/schedules
      await fetchAttendanceCounts();

    } catch (err) {
      console.warn('Dashboard loadData failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // initial load
    loadData();
  }, []);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await loadData();
    } catch (err) {
      console.warn('Refresh failed', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Utility: check whether a schedule entry corresponds to a user with role === 'user'
  const scheduleIsUser = (s: ScheduleItem) => {
    if (s.employee_id) {
      // sample backend returns employee_id as object with role/_id
      // First check if employee_id is an object before accessing role
      if (typeof s.employee_id === 'object' && s.employee_id !== null) {
        const role = (s.employee_id as any).role ?? (s.employee_id as any)?.role;
        if (typeof role === 'string') {
          return role === 'user';
        }
      }
      // fallback: try match against usersState by id
      const id = typeof s.employee_id === 'object' && s.employee_id !== null ? 
        (s.employee_id as any)._id ?? s.employee_id : s.employee_id;
      if (id) {
        const found = usersState.find((u) => u._id === id || (u as any).id === id);
        return found?.role === 'user';
      }
    }
    return false;
  };

  // Global totals (only role === 'user')
  const totalStaff = useMemo(() => usersState.filter((u) => u.role === 'user').length, [usersState]);

  // Staff on shift today (unique user count where schedule date == today and employee role === 'user')
  const todaysUniqueStaffCount = useMemo(() => {
    const set = new Set<string>();
    schedulesState.forEach((s) => {
      if (!scheduleIsUser(s)) return;
      const uid = typeof s.employee_id === 'object' && s.employee_id !== null ? 
        (s.employee_id as any)._id ?? s.employee_id : s.employee_id;
      if (uid) set.add(String(uid));
    });
    return set.size;
  }, [schedulesState, usersState]);

  // Per-branch counts
  const branchCounts = useMemo(() => {
    return branchesState.map((branch) => {
      const branchId = branch._id ?? (branch as any).id;

      // total employees in branch (only role === 'user')
      const totalEmployees = usersState.filter((u) => {
        if (u.role !== 'user') return false;
        const b = u.branch;
        if (!b) return false;
        if (typeof b === 'string') return b === branchId || b === branch.name;
        return (b._id ?? b) === branchId;
      }).length;

      // unique users scheduled today for this branch (only role === 'user')
      const workingSet = new Set<string>();
      schedulesState.forEach((s) => {
        // schedule must be of today already since schedulesState is filtered by today
        // check branch match
        const sBranchId = typeof s.branch_id === 'object' && s.branch_id !== null ? 
          (s.branch_id as any)._id ?? s.branch_id : s.branch_id;
        if (!sBranchId) return;
        if (String(sBranchId) !== String(branchId)) return;
        if (!scheduleIsUser(s)) return;
        const uid = typeof s.employee_id === 'object' && s.employee_id !== null ? 
          (s.employee_id as any)._id ?? s.employee_id : s.employee_id;
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
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Image
                source={require("../../../assets/icons/totalstaff_b.png")}
                style={styles.icon}
              />
              <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}> {lang.total_staff}</Text>
            </View>
            {/* <Text style={styles.total_count}>{totalStaff}</Text> */}
            <Text style={styles.total_count}>{todaysUniqueStaffCount}</Text>
          </CartBox>

          <CartBox containerStyle={styles.staff}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Image
                source={require("../../../assets/icons/staff_tik_g.png")}
                style={styles.icon}
              />
              <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}>{lang.staff_on_shift}</Text>
            </View>

            {/* <Text style={styles.shift_count}>{todaysUniqueStaffCount}</Text> */}
            <Text style={styles.shift_count} ellipsizeMode='tail' numberOfLines={1}>
              {attendanceLoading ? "..." : totalAttendanceCount}
            </Text>

          </CartBox>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            style={{ marginBottom: 0 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
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
                    console.log('Navigating to AttendanceScreen with:', navParams);
                    navigation.navigate('AttendanceScreen', navParams);
                  }}
                >
                  <CartBox containerStyle={styles.branch}>
                    <View style={{ flexDirection: "row", alignItems: "center", width: '90%' }}>
                      <Image
                        source={require("../../../assets/icons/branch_b_withbg.png")}
                        style={styles.icon}
                      />
                      <Text style={styles.branch_name} ellipsizeMode="tail" numberOfLines={1}>{b.branchName}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                      {/* <Text style={styles.count}>{b.todayWorking}</Text> */}
                      <Text style={styles.count}>
                        {attendanceLoading ? "..." : (branchAttendanceCounts[String(b.branchId)] ?? 0)}
                      </Text>
                      <Text style={styles.count}>/</Text>
                      {/* <Text style={styles.count}>{b.totalEmployees}</Text> */}
                      <Text style={styles.count}>{b.todayWorking}</Text>

                    </View>
                  </CartBox>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      <Popup
        visible={logoutPopupVisible}
        onClose={() => setLogoutPopupVisible(false)}
        popupBorderColor={colors.error_text}
        dismissOnOverlayPress={false}
        title={lang.Logout}
        titleStyle={{ color: colors.error_text }}
      >
        <Text style={styles.popupsubtext}>
          {lang.logout_confirm}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
<Button1
  text={lang.yes}
  onPress={async () => {
    setLogoutPopupVisible(false);

    try {
      // Call backend logout. axiosInstance will include Authorization header from AsyncStorage.
      await apiLogout();
      console.log('apiLogout() succeeded.');
    } catch (err) {
      console.warn('apiLogout() failed (ignored):', err);
      // continue — we'll still clear local data and navigate
    }

    try {
      // Ensure local storage is cleared (AuthService.logout may already do this).
      await clearAllAuthData();
      console.log('Cleared auth data (token & userId).');
    } catch (err) {
      console.warn('Failed to clear auth data on logout:', err);
      // continue to navigate even if clearing fails
    }

    // reset navigation to login screen
    navigation.reset({
      index: 0,
      routes: [{ name: "LoginScreen", params: { langId: selectedLanguage } }],
    });

    console.log('Logout -> navigated to LoginScreen with params:', { userId, langId: selectedLanguage });
  }}
  backgroundColor={colors.primary}
  width={'48%'}
  textStyle={{ color: colors.secondary }}
/>


          <Button1
            text={lang.no}
            onPress={() => setLogoutPopupVisible(false)}
            backgroundColor={colors.error_text}
            width={'48%'}
            textStyle={{ color: colors.secondary }}
          />
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
    alignSelf: 'center'
  },
  body: {
    marginTop: 20,
    marginHorizontal: 20,
    flex: 1,
  },
  boxes: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12
  },
  icon: {
    width: 30 * base,
    height: 30,
  },
  total_staff: {
    color: colors.search,
    fontWeight: fonts.weight.regular ,
    fontSize: 14,
    marginLeft: 8,
    width: "75%"
  },
  total_count: {
    fontWeight: fonts.weight.medium ,
    fontSize: fonts.size.xxl,
    color: colors.primary,
    marginTop: 8,
  },
  shift_count: {
    fontWeight: fonts.weight.medium ,
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
    alignItems: "flex-start",
  },
  all_branches: {
  },
  branch: {
    alignItems: 'flex-start',
    paddingTop: 12,
    paddingLeft: 12,
    paddingBottom: 12,
    marginBottom: 12,
    borderRadius: 10
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
});
