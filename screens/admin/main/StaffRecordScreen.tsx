// screens/admin/main/StaffRecordScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import CartBox from "../../../components/CartBox";
import fonts from "../../../styles/Fonts";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import translations from "../../../assets/translations.json";
import Toast, { toastConfig, showSuccessToast, showErrorToast } from "../../../components/Toast";
import Button3 from "../../../components/Button";
import SearchBar from "../../../components/SearchBar";

import { fetchUsers, getUserById, ProfileUser } from "../../../api/profile";

const StaffRecordScreen: React.FC<any> = (props) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // incoming props/params, Footer passes these
  const propUserId = props.userId;
  const propLangId = props.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;
  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || "en";
  const lang = (translations as any)[langId] || (translations as any)["en"];
  const paramUserId = route.params?.userId ?? route.params?.id ?? propUserId ?? null;
  const paramLangId = route.params?.langId ?? propLangId ?? "en";

  // local state
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [users, setUsers] = useState<ProfileUser[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");

  // load branch from given userId and then load users for that branch
  const loadData = useCallback(async (fromRefresh = false) => {
    if (!paramUserId) {
      console.warn("StaffRecordScreen: no userId param provided.");
    }
    try {
      if (fromRefresh) setRefreshing(true);
      else setLoading(true);

      console.log("StaffRecordScreen -> loadData start", { userId: paramUserId, langId: paramLangId });

      // 1. Resolve the branch from the provided userId (Footer-supplied)
      let resolvedBranchId: string | null = null;
      let resolvedBranchName: string | null = null;
      if (paramUserId) {
        try {
          const u = await getUserById(paramUserId);
          console.log("StaffRecordScreen -> getUserById returned:", u);
          if (u && u.branch) {
            if (typeof u.branch === "string") {
              resolvedBranchId = u.branch;
            } else if (u.branch._id) {
              resolvedBranchId = String(u.branch._id);
              resolvedBranchName = String((u.branch).name ?? "");
            }
          }
        } catch (err) {
          console.warn("StaffRecordScreen -> getUserById failed:", err);
        }
      }

      // save resolved branch into state 
      if (resolvedBranchId) {
        setBranchId(resolvedBranchId);
        if (resolvedBranchName) setBranchName(resolvedBranchName);
        console.log("StaffRecordScreen -> resolved branch:", { branchId: resolvedBranchId, branchName: resolvedBranchName });
      } else {
        console.warn("StaffRecordScreen -> could not resolve branch from userId param.");
        setBranchId(null);
        setBranchName(null);
      }

      // 2. Fetch all users for that branch ("role": "user")
      // If branch not resolved, pass undefined — API may return all users; we guard client-side to show nothing or warn.
      const fetchParams: any = { role: "user", limit: 1000 };
      if (resolvedBranchId) fetchParams.branchId = resolvedBranchId;

      const res = await fetchUsers(fetchParams);
      const fetchedUsers = Array.isArray(res.users) ? res.users : [];
      // ensure role === 'user'
      const onlyUsers = fetchedUsers.filter((x: any) => ((x && x.role) ?? "user") === "user");

      console.log("StaffRecordScreen -> fetched users count:", onlyUsers.length);

      // console.log("StaffRecordScreen -> fetched users sample (first 10):", onlyUsers.slice(0, 10));

      setUsers(onlyUsers);
    } catch (err) {
      console.error("StaffRecordScreen -> loadData error:", err);
      showErrorToast("Failed to load staff");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [paramUserId, paramLangId]);

  // Auto refresh every time screen is focused
  useFocusEffect(
    useCallback(() => {
      console.log("StaffRecordScreen -> screen focused. Params:", { userId: paramUserId, langId: paramLangId });
      // immediately load data when screen gains focus
      void loadData(false);
      // cleanup not required
      return () => {
        console.log("StaffRecordScreen -> screen unfocused.");
      };
    }, [paramUserId, paramLangId, loadData])
  );

  // manual pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    console.log("StaffRecordScreen -> onRefresh invoked");
    await loadData(true);
  }, [loadData]);

  // search / filter
  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Array.isArray(users) ? users : [];
    if (!q) {
      // sort: newest first by createdAt / updatedAt
      return list.slice().sort((a, b) => {
        const aT = new Date(a.createdAt ?? a.updatedAt ?? 0).getTime();
        const bT = new Date(b.createdAt ?? b.updatedAt ?? 0).getTime();
        return bT - aT;
      });
    }
    return list
      .filter((u) => {
        const name = (u.fullname ?? "New User").toString().toLowerCase();
        const position = (u.position ?? "Staff").toString().toLowerCase();
        const username = (u.username ?? "undefined").toString().toLowerCase();
        return name.includes(q) || position.includes(q) || username.includes(q);
      })
      .sort((a, b) => {
        const aT = new Date(a.createdAt ?? a.updatedAt ?? 0).getTime();
        const bT = new Date(b.createdAt ?? b.updatedAt ?? 0).getTime();
        return bT - aT;
      });
  }, [users, query]);

  // navigation helpers with logs
  const openNotification = () => {
    console.log("StaffRecordScreen -> navigate to NotificationScreen with:", { userId: paramUserId, langId: langId, branchId });
    navigation.navigate("NotificationScreen" as any, {
      userId: paramUserId,
      langId: langId,
      branchId,
    });
  };

  const openAddStaff = () => {
    console.log("StaffRecordScreen -> navigate to AddStaffScreen with:", { userId: paramUserId, langId: langId, branchId });
    navigation.navigate("AddStaffScreen" as any, {
      userId: paramUserId,
      langId: langId,
      branchId,
    });
  };

  const openStaffProfile = (staffId: string) => {
    console.log("StaffRecordScreen -> navigate to StaffProfileScreen with:", { id: staffId, userId: paramUserId, langId: langId, branchId });
    navigation.navigate("StaffProfileScreen" as any, {
      id: staffId,
      userId: paramUserId,
      langId: langId,
      branchId,
    });
  };

  // UI
  return (
    <View style={styles.outer}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: lang.Staff_Record, color: colors.text }}
        right={{
          type: "image",
          url: require("../../../assets/icons/f_notification_b.png"),
          width: 24,
          height: 24,
          onPress: openNotification,
        }}
      />

      <View style={styles.container}>
        <View style={styles.body}>
          <View style={styles.searchWrap}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={lang.search_placeholder ?? "Search name or position"} />
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              {/* <Text style={{ color: colors.subtext, marginTop: 8 }}>Loading staff...</Text> */}
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: '40%',}}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
              showsVerticalScrollIndicator={false}
            >
              {filteredUsers.length === 0 ? (
                <Text style={styles.noDataText}>{lang.no_staff_found}</Text>
              ) : (
                filteredUsers.map((u: ProfileUser, index: number) => {
                  const displayName = u.fullname ?? "New User";
                  const position = u.position ?? "Saff";
                  const staffLabel = `Staff${(index + 1).toString().padStart(2, "0")}`;
                  const userIdKey = (u)._id ?? (u).id ?? `u-${index}`;
                  return (
                    <TouchableOpacity key={userIdKey} onPress={() => openStaffProfile(userIdKey)}>
                      <CartBox containerStyle={styles.detail_cartbox}>
                        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                            <Image source={require("../../../assets/images/profile2.png")} style={styles.profileImage} />
                            <View style={styles.name_position}>
                              <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                                {displayName}
                              </Text>
                              <Text style={styles.position} numberOfLines={1} ellipsizeMode="tail">{position}</Text>
                            </View>
                          </View>
                          <View style={{ justifyContent: "center", alignItems: "flex-end" }}>
                            <Text style={styles.staffLabel}>{staffLabel}</Text>
                          </View>
                        </View>
                      </CartBox>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>
      </View>

      <Button3 width={60} height={60} onPress={openAddStaff} />
      <Toast config={toastConfig} />
    </View>
  );
};

export default StaffRecordScreen;

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.secondary },
  container: { marginTop: 20, marginHorizontal: 20, flex: 1 },
  body: { flex: 1 },
  searchWrap: { marginBottom: 0, paddingBottom:12 },
  loadingWrap: { justifyContent: "center", marginTop: '60%' },
  noDataText: { textAlign: "center", color: colors.subtext, marginTop: 12 },
  detail_cartbox: {
    width: "100%",
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  profileImage: { width: 40, height: 40, borderRadius: 20, resizeMode: "cover" },
  name_position: { marginLeft: 10, width: "65%" },
  name: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular, color: colors.text },
  position: { fontSize: fonts.size.s, color: colors.subtext, marginTop: 8, fontWeight: fonts.weight.regular },
  staffLabel: { fontSize: fonts.size.s, color: colors.subtext, fontWeight: fonts.weight.regular },
});
