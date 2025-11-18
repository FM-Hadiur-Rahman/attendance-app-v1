// screens/admin/main/StaffRecordScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ListRenderItemInfo,
  RefreshControl,
} from "react-native";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import CartBox from "../../../components/CartBox";
import fonts from "../../../styles/Fonts";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import translations from "../../../assets/translations.json";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../components/Toast";
import Button3 from "../../../components/Button";
import SearchBar from "../../../components/SearchBar";

import { fetchUsers, getBranchId, getProfile, ProfileUser, getUserById, } from "../../../api/profile";
import { getUserId } from "../../../api/auth/authToken";

const StaffRecordScreen: React.FC = (props: any) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // props / route fallback
  const propUserId = (props as any)?.userId;
  const propLangId = (props as any)?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;

  const userId = propUserId || routeUserId || null;
  const langId = propLangId || routeLangId || "en";

  const lang = (translations as any)[langId] || (translations as any)["en"];

  // state
  const [users, setUsers] = useState<ProfileUser[]>([]);
  const [sampleUserId, setSampleUserId] = useState<string | null>(null);
  const [loggedInUserId, setLoggedInUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(8); // desired per-page display
  const [prefetched, setPrefetched] = useState<ProfileUser[]>([]); // buffer of already-fetched but not-yet-displayed users
  const [totalPages, setTotalPages] = useState<number>(1); // track total pages from API
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [version, setVersion] = useState<number>(0);
  const [query, setQuery] = useState<string>("");
  const [refreshing, setRefreshing] = useState<boolean>(false);
  //const [activeBranchId, setActiveBranchId] = useState<string | null>(null);

  // accept branch if caller passed it 
  const passedBranchId = route.params?.branch_id ?? route.params?.branchId ?? null;
  const passedBranchName = route.params?.branch_name ?? route.params?.branchName ?? null;

  // local state for the active branch
  const [activeBranchId, setActiveBranchId] = useState<string | null>(passedBranchId || null);
  const [activeBranchName, setActiveBranchName] = useState<string | null>(passedBranchName || null);

  // If branch not passed, try to resolve it from the userId 
  useEffect(() => {
    if (!userId) {
      console.log("StaffRecordScreen: no userId in params");
      return;
    }
    if (activeBranchId) {
      console.log("StaffRecordScreen: activeBranchId already set:", activeBranchId);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        console.log("🔍 StaffRecordScreen fetching user by ID:", userId);
        const u = await getUserById(userId);
        if (!mounted || !u) return;

        const branchField = u.branch;
        const branchId =
          typeof branchField === "string"
            ? branchField
            : branchField?._id ?? null;

        const branchName =
          typeof branchField === "object"
            ? branchField?.name ?? null
            : null;

        if (branchId) {
          setActiveBranchId(String(branchId));
          if (branchName) setActiveBranchName(branchName);
          console.log("StaffRecordScreen: activeBranchId set to:", branchId);
        } else {
          console.log("StaffRecordScreen: user has no branch");
        }
      } catch (err) {
        console.warn("StaffRecordScreen: failed to resolve branch from userId", err);
      }
    })();
    return () => { mounted = false; };
  }, [userId, activeBranchId]);

  const onEndReachedCalledDuringMomentum = useRef<boolean>(true);

  // Helper: safe find
  const safeFind = <T,>(arr: T[] | undefined | null, predicate: (item: T) => boolean): T | undefined => {
    if (!Array.isArray(arr)) return undefined;
    return arr.find(predicate);
  };

  // loadUsers: fetch pages until we have `limit` items that are role==='user' (or pages exhausted)
  const loadUsers = async (branchIdParam?: string | null, pageParam: number = 1, replace: boolean = true) => {
    if (pageParam === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      let branchToUse: string | null = branchIdParam ?? activeBranchId ?? null;
      if (!branchToUse) {
        try { const saved = await getBranchId(); if (saved) branchToUse = saved; } catch { }
      }
      if (!branchToUse) {
        try {
          const profile = await getProfile();
          const branchFromProfile = typeof profile.branch === "string" ? profile.branch : profile.branch?._id ?? null;
          if (branchFromProfile) { branchToUse = branchFromProfile; setActiveBranchId(branchFromProfile); }
        } catch { }
      }
      console.log("[loadUsers] start - pageParam:", pageParam, "replace:", replace, "branch:", branchToUse);

      // first fetch the requested page
      const result = await fetchUsers({
        branchId: branchToUse ?? undefined,
        // keep role param if you want server-side filtering, but still filter client-side to be safe
        role: "user",
        page: pageParam,
        limit,
      });

      let fetched = Array.isArray(result.users) ? result.users.slice() : [];
      const apiTotalPages = typeof result.totalPages === "number" ? result.totalPages : 1;
      setTotalPages(apiTotalPages);

      // client-side: keep only role === 'user' (treat missing role as 'user' if desired)
      const isUser = (u: any) => {
        const r = (u && u.role) ?? "user";
        return r === "user";
      };
      fetched = fetched.filter(isUser);

      let lastPageFetched = pageParam;

      // If initial load and fetched < desired limit, fetch subsequent pages until we have `limit` user-items
      if (replace && pageParam === 1 && fetched.length < limit && lastPageFetched < apiTotalPages) {
        console.log("[loadUsers] need more user items, fetching more pages...");
        while (fetched.length < limit && lastPageFetched < apiTotalPages) {
          lastPageFetched++;
          console.log(`[loadUsers] fetching page ${lastPageFetched}...`);
          const nextResult = await fetchUsers({
            branchId: branchToUse ?? undefined,
            role: "user",
            page: lastPageFetched,
            limit,
          });
          const nextUsers = Array.isArray(nextResult.users) ? nextResult.users : [];
          const nextUsersFiltered = nextUsers.filter(isUser);
          console.log(`[loadUsers] page ${lastPageFetched} returned ${nextUsers.length}, filtered to ${nextUsersFiltered.length}`);
          fetched = [...fetched, ...nextUsersFiltered];
        }
      }

      if (replace) {
        const showCount = Math.min(limit, fetched.length);
        const toShow = fetched.slice(0, showCount);
        const buffer = fetched.slice(showCount); // extras (may be 0)
        setUsers(toShow);
        setPrefetched(buffer);
        setPage(lastPageFetched);
        const hasMoreLocal = buffer.length > 0 || lastPageFetched < apiTotalPages;
        setHasMore(hasMoreLocal);
        console.log("[loadUsers] initial show:", toShow.length, "buffer:", buffer.length, "hasMore:", hasMoreLocal);
      } else {
        // append mode: merge fetched with existing while avoiding duplicates
        setUsers((prev) => {
          const existingIds = new Set(prev.map((u: any) => u._id ?? u.id));
          const toAdd = fetched.filter((u: any) => !existingIds.has(u._id ?? u.id));
          return [...prev, ...toAdd];
        });
        setPage(lastPageFetched);
        setHasMore(lastPageFetched < apiTotalPages);
      }

    } catch (err) {
      console.error("Failed to fetch users", err);
      if (pageParam === 1) setUsers([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const incomingToast: string | undefined = (props as any)?.toastMessage;
    const onConsumed = (props as any)?.onConsumedToast;
    if (incomingToast) {
      try {
        showSuccessToast?.(incomingToast);
      } catch (e) { console.warn('toast failed', e); }
      // notify parent/footer that we've consumed the message
      if (typeof onConsumed === 'function') {
        onConsumed();
      } else {
        // fallback: also try navigation.setParams to clear route params if needed
        try { (navigation as any).setParams?.({ toastMessage: null }); } catch { }
      }
    }
  }, [(props as any)?.toastMessage]);

  // initial load: get logged-in user id then load first page
  useEffect(() => {
    const init = async () => {
      try {
        try {
          const uid = await getUserId();
          if (uid) {
            setLoggedInUserId(uid);
            console.log("Logged in user id:", uid);
          } else {
            console.log("No logged in user id found");
          }
        } catch (getUserErr) {
          console.error("getUserId() failed:", getUserErr);
        }
        setPage(1);
        setHasMore(true);
        await loadUsers(undefined, 1, true);
      } catch (err) {
        console.error("Init error in StaffRecordScreen:", err);
        await loadUsers(null, 1, true);
      }
    };
    init();
  }, []);
  useEffect(() => {
    console.log("[DEBUG] users state length:", users.length);
    if (users.length > 0) {
      console.log("[DEBUG] users sample (first 5):", users.slice(0, 5).map(u => ({
        _id: u._id,
        fullname: u.fullname,
        role: u.role,
        branch: (u as any).branch ?? (u as any).branch_id ?? null,
      })));
    }
  }, [users]);

  // --- AUTO REFRESH ON FOCUS ---
  // whenever the screen receives focus (i.e. when navigating back to it), reload page 1.
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const refreshOnFocus = async () => {
        try {
          // reset paging and fetch fresh data
          if (!mounted) return;
          setPage(1);
          setHasMore(true);
          await loadUsers(activeBranchId ?? null, 1, true);
          // optionally reset search and bump version to update memoized lists
          setQuery("");
          setVersion((v) => v + 1);
        } catch (e) {
          console.warn("refresh on focus failed", e);
        }
      };
      refreshOnFocus();

      return () => { mounted = false; };
    }, [activeBranchId])
  );
  // --- end auto refresh ---

  const employees = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Array.isArray(users) ? users : [];
    return list
      .filter((u) => (u?.role ?? "user") === "user")
      .filter((u) => {
        const branchId = (u as any)?.branch_id ?? (u as any)?.branch?._id ?? (u as any)?.branch ?? null;
        if (!activeBranchId) return true;
        if (!branchId) return true;
        return branchId === activeBranchId;
      })
      .filter((u) => {
        if (!q) return true;
        const name = u.fullname ?? `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim();
        const full = `${name} ${u.position ?? ""}`.toLowerCase();
        return full.includes(q);
      })
      .sort((a: any, b: any) => {
        // Try sort by createdAt → fallback to updatedAt → fallback to _id
        const dateA = new Date(a.createdAt || a.updateDate || 0).getTime();
        const dateB = new Date(b.createdAt || b.updateDate || 0).getTime();
        return dateB - dateA; // DESC => latest first
      });

  }, [users, query, version, activeBranchId]);

  const navAndLog = (routeName: string, params?: any) => {
    const allParams = { ...(params || {}), userId, langId };
    console.log(`Navigate -> ${routeName}`, allParams);
    navigation.navigate(routeName as any, allParams);
  };
  const openAddStaff = async () => {
    try {
      // Try to use existing activeBranchId first
      let branchIdToPass: string | undefined = activeBranchId ?? undefined;

      // If we don't have it yet, fetch the logged-in profile to get branch id
      if (!branchIdToPass) {
        try {
          const profile = await getProfile();
          const branchFromProfile =
            typeof profile?.branch === "string"
              ? profile.branch
              : profile?.branch?._id ?? null;
          if (branchFromProfile) {
            branchIdToPass = branchFromProfile;
            setActiveBranchId(branchFromProfile);
            console.log("Determined branchId from profile:", branchFromProfile);
          } else {
            console.log("No branch found on profile");
          }
        } catch (pfErr) {
          console.warn("getProfile() failed while opening AddStaffScreen:", pfErr);
        }
      }

      navigation.navigate("AddStaffScreen" as any, {
        userId,
        langId,
        branchId: branchIdToPass ?? undefined,
        onSave: (newStaff: Partial<ProfileUser> & { id?: string; firstname: string; lastname?: string; position?: string; role?: string }) => {
          const newId = `U${(users.length + 1).toString().padStart(3, "0")}`;
          const payload: ProfileUser = {
            id: newId,
            fullname: `${newStaff.firstname ?? "New"} ${newStaff.lastname ?? "Staff"}`.trim(),
            username: ((newStaff.firstname ?? "user") as string).toLowerCase(),
            role: newStaff.role ?? "user",
            position: newStaff.position ?? "",
            branch_id: branchIdToPass ?? activeBranchId ?? undefined,
            createDate: new Date().toISOString(),
            updateDate: new Date().toISOString(),
          } as any;
          setUsers((prev) => [payload, ...prev]);
          setVersion((v) => v + 1);
          showSuccessToast("Staff added");
        },
      });
    } catch (err) {
      console.error("openAddStaff error:", err);
      // fallback: navigate without branch if something unexpected fails
      navigation.navigate("AddStaffScreen" as any, {
        userId,
        langId,
        branchId: activeBranchId ?? undefined,
      });
    }
  };

  const openStaffProfile = (staffId: string) => {
    const staff = safeFind(users, (u) => (u as any).id === staffId || (u as any)._id === staffId);
    const fullname = staff?.fullname || `${(staff as any)?.firstname ?? ""} ${(staff as any)?.lastname ?? ""}`.trim() || "Unknown";
    console.log("CartBox pressed -> StaffProfileScreen", {
      id: staffId,
      UserId: loggedInUserId, // logged-in admin id
      langId,
      fullname,
    });
    navAndLog("StaffProfileScreen", { id: staffId, userId: loggedInUserId ?? userId, langId });
  };

  // refresh handler
  const onRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    setHasMore(true);
    try {
      await loadUsers(activeBranchId ?? null, 1, true);
      setQuery("");
      setVersion((v) => v + 1);
    } finally {
      setRefreshing(false);
    }
  };

  // load more handler
  const loadMore = async () => {
    if (loadingMore || loading || !hasMore) return;
    if (onEndReachedCalledDuringMomentum.current) return;

    onEndReachedCalledDuringMomentum.current = true;
    try {
      setLoadingMore(true);

      let buffer = Array.isArray(prefetched) ? prefetched.slice() : [];
      if (buffer.length > 0) {
        const take = buffer.slice(0, limit);
        setUsers((prev) => [...prev, ...take]);
        buffer = buffer.slice(take.length);
        setPrefetched(buffer);
        const hasMoreLocal = buffer.length > 0 || page < totalPages;
        setHasMore(hasMoreLocal);
        console.log("[loadMore] used buffer, take:", take.length, "bufferLeft:", buffer.length, "hasMore:", hasMoreLocal);
        return;
      }

      // else request next page
      const nextPage = page + 1;
      if (nextPage > totalPages) {
        setHasMore(false);
        return;
      }

      console.log("[loadMore] fetching page", nextPage);
      const res = await fetchUsers({
        branchId: activeBranchId ?? undefined,
        role: "user",
        page: nextPage,
        limit,
      });

      const fetchedRaw = Array.isArray(res.users) ? res.users : [];
      // client-side filter for safety
      const isUser = (u: any) => ((u && u.role) ?? "user") === "user";
      const fetched = fetchedRaw.filter(isUser);

      const apiTotalPages = typeof res.totalPages === "number" ? res.totalPages : totalPages;
      setTotalPages(apiTotalPages);

      setUsers((prev) => {
        const existingIds = new Set(prev.map((u: any) => u._id ?? u.id));
        const toAdd = fetched.filter((u: any) => !existingIds.has(u._id ?? u.id));
        return [...prev, ...toAdd];
      });

      setPage(nextPage);
      setHasMore(nextPage < apiTotalPages);
      console.log("[loadMore] appended:", fetched.length, "nextPage:", nextPage, "hasMore:", nextPage < apiTotalPages);
    } catch (err) {
      console.error("loadMore failed", err);
    } finally {
      setLoadingMore(false);
    }
  };


  const renderItem = ({ item, index }: ListRenderItemInfo<ProfileUser>) => {
    const u = item;
    const displayName = u.fullname || `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim();
    const position = u.position ?? "";
    const staffLabel = `Staff${(index + 1).toString().padStart(2, "0")}`;
    const userIdKey = (u as any)._id ?? (u as any).id ?? `u-${index}`;

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
  };

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
          onPress: () => {
            console.log('StaffRecordScreen to NotificationScreen — params:', { userId, langId, activeBranchId });
            navigation.navigate("NotificationScreen" as any, {
              userId,
              langId,
              branchId: activeBranchId,
            });
          },
        }}

      />

      <View style={styles.container}>
        <View style={styles.body}>
          <View style={styles.searchWrap}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={lang.search_placeholder} />
          </View>

          {loading && page === 1 ? (
            <View style={{ marginTop: 20, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={employees}
              renderItem={renderItem}
              keyExtractor={(item, idx) => ((item as any)._id ?? (item as any).id ?? `u-${idx}`).toString()}
              onEndReached={loadMore}
              onEndReachedThreshold={0.2}
              onMomentumScrollBegin={() => {
                onEndReachedCalledDuringMomentum.current = false;
              }}
              ListFooterComponent={() =>
                loadingMore ? (
                  <View style={{ padding: 12, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : null
              }
              ListEmptyComponent={() => (!loading ? <Text style={styles.noDataText}>{lang.no_staff_found}</Text> : null)}
              refreshing={refreshing}
              onRefresh={onRefresh}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[colors.primary]}
                  tintColor={colors.primary}
                />
              }
              contentContainerStyle={{ paddingBottom: 160, paddingTop: 12 }}
              showsVerticalScrollIndicator={false}
            />
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
  container: { marginTop: 12, marginHorizontal: 20, flex: 1 },
  body: { flex: 1 },
  searchWrap: { marginBottom: 8 },
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
  name: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular as any, color: colors.text },
  position: { fontSize: fonts.size.s, color: colors.subtext, marginTop: 8, fontWeight: fonts.weight.regular as any },
  staffLabel: { fontSize: fonts.size.s, color: colors.subtext, fontWeight: fonts.weight.regular as any },
});


