// // screens/admin/main/StaffRecordScreen.tsx
// import React, { useMemo, useState } from "react";
// import {
//   View,
//   Text,
//   StyleSheet,
//   Image,
//   ScrollView,
//   TouchableOpacity,
//   RefreshControl,
// } from "react-native";
// import Header from "../../../components/Header";
// import colors from "../../../styles/Colors";
// import CartBox from "../../../components/CartBox";
// import fonts from "../../../styles/Fonts";
// import { users } from "../../../api/Users";
// import { users as usersArr, User } from "../../../api/Users";
// import { useNavigation, useRoute } from "@react-navigation/native";
// import translations from "../../../assets/translations.json";

// import { showSuccessToast } from "../../../components/Toast";
// import Button3 from "../../../components/Button";
// import SearchBar from "../../../components/SearchBar";

// const StaffRecordScreen: React.FC = (props: any) => {
//   const navigation = useNavigation<any>();
//   const route = useRoute<any>();

//   // support prop-based injection (Footer) or fallback to route params
//   const propUserId = (props as any)?.userId;
//   const propLangId = (props as any)?.langId;
//   const routeUserId = route.params?.userId ?? route.params?.id;
//   const routeLangId = route.params?.langId ?? route.params?.language;

//   const userId = propUserId || routeUserId || null;
//   const langId = propLangId || routeLangId || "en";

//     // get branch id passed in params (superadmin may pass this)
//   const passedBranchId = route.params?.branch_id ?? route.params?.branchId ?? null;
//   // fallback: admin's default branch from users list
//   const currentAdmin = users.find((u) => u.id === userId) || null;
//   const activeBranchId = passedBranchId || currentAdmin?.branch_id || null;

//   // translation dictionary for this screen
//   const lang = (translations as any)[langId] || (translations as any)["en"];

//   // local "version" to force re-compute when usersArr mutated
//   const [version, setVersion] = useState<number>(0);

//   // search text
//   const [query, setQuery] = useState<string>("");

//   // refresh state
//   const [refreshing, setRefreshing] = useState<boolean>(false);

//   // Compute employee list from users mock, filtered by search AND by branch_id of the passed userId (if available)
//   const employees = useMemo(() => {
//     const q = query.trim().toLowerCase();

//     // find branch_id of current userId (if provided)
//     let branchFilter: string | null = null;
//     if (userId) {
//       const currentUser = usersArr.find((u) => u.id === userId);
//       if (currentUser && (currentUser as any).branch_id) {
//         branchFilter = (currentUser as any).branch_id;
//       }
//     }

//     return usersArr
//       .filter((u) => u.role === "employee")
//       .filter((u) => {
//         // if branchFilter set, only include employees with same branch_id
//         if (branchFilter && (u as any).branch_id !== branchFilter) return false;
//         return true;
//       })
//       .filter((u) => {
//         if (!q) return true;
//         // build a searchable full string supporting either fullname or firstname+lastname
//         const name =
//           (u as any).fullname ??
//           `${(u as any).firstname ?? ""} ${(u as any).lastname ?? ""}`.trim();
//         const full = `${name} ${u.position ?? ""}`.toLowerCase();
//         return full.includes(q);
//       });
//   }, [version, query, userId]);

//   const navAndLog = (routeName: string, params?: any) => {
//     const allParams = { ...(params || {}), userId, langId };
//     console.log(`Navigate -> ${routeName}`, allParams);
//     navigation.navigate(routeName as any, allParams);
//   };

//   // Floating button -> open AddStaffScreen
//   const openAddStaff = () => {
//     console.log("Navigate -> AddStaffScreen", { userId, langId, mode: "create" });
//     navigation.navigate("AddStaffScreen" as any, {
//       userId,
//       langId,
//       onSave: (newStaff: Partial<User> & { id?: string; firstname: string; lastname: string; position?: string; role?: "employee" | "admin" }) => {
//         // if id provided and exists -> update
//         if (newStaff.id) {
//           const idx = usersArr.findIndex((u) => u.id === newStaff.id);
//           if (idx !== -1) {
//             usersArr[idx] = {
//               ...usersArr[idx],
//               firstname: newStaff.firstname,
//               lastname: newStaff.lastname,
//               position: newStaff.position ?? usersArr[idx].position,
//               role: (newStaff.role as any) ?? usersArr[idx].role,
//               updateDate: new Date().toISOString(),
//             } as any;
//             setVersion((v) => v + 1);
//             showSuccessToast("Staff updated");
//             console.log("AddStaffScreen -> updated staff", usersArr[idx]);
//             return;
//           }
//           // id provided but not found -> fallthrough to create new
//         }

//         // create new staff ID
//         const newId = `U${(usersArr.length + 1).toString().padStart(3, "0")}`;
//         const payload: User = {
//           id: newId,
//           fullname: `${newStaff.firstname ?? "New"} ${newStaff.lastname ?? "Staff"}`,
//           phone: newStaff["phone"] ?? "",
//           email: newStaff["email"] ?? "",
//           username: (newStaff.firstname ?? "user").toLowerCase(),
//           password: "Pass@123",
//           role: (newStaff.role as any) ?? "employee",
//           position: newStaff.position ?? "",
//           branch_id: (newStaff as any).branch_id ?? (usersArr[0] as any)?.branch_id ?? "",
//           schedule_id: (newStaff as any).schedule_id ?? "",
//           createDate: new Date().toISOString(),
//           updateDate: new Date().toISOString(),
//         } as any;
//         usersArr.push(payload as any);
//         setVersion((v) => v + 1);
//         showSuccessToast("Staff added");
//         console.log("AddStaffScreen -> added staff", payload);
//       },
//     });
//   };

//   const openStaffProfile = (staffId: string, userId: string, langId: string) => {
//     const params = { id: staffId, userId, langId };
//     console.log("CartBox pressed -> StaffProfileScreen", params);
//     navAndLog("StaffProfileScreen", params);
//   };

//   // Pull-to-refresh: clear search and refresh view
//   const onRefresh = async () => {
//     setRefreshing(true);
//     await new Promise((r) => setTimeout(r, 1000));
//     setQuery("");
//     // bump version to re-render from the global usersArr if mutated externally
//     setVersion((v) => v + 1);
//     setRefreshing(false);
//   };

//   return (
//     <View style={styles.outer}>
//       <Header
//         backgroundColor={colors.secondary}
//         position="relative"
//         center={{ type: "text", value: lang.Staff_Record, color: colors.text }}
//         right={{
//           type: "image",
//           url: require("../../../assets/icons/f_notification_b.png"),
//           width: 24,
//           height: 24,
//           onPress: () => {
//             console.log("Header right pressed -> NotificationScreen", { userId, langId, activeBranchId });
//             navAndLog("NotificationScreen", { userId, langId, activeBranchId });
//           },
//         }}
//       />

//       <View style={styles.container}>
//         <View style={styles.body}>
//           <View style={styles.searchWrap}>
//             {/* Use existing SearchBar component and wire it to query */}
//             <SearchBar value={query} onChangeText={setQuery} placeholder={lang.search_placeholder} />
//           </View>

//           <ScrollView
//             style={{ marginTop: 12, marginBottom: "15%" }}
//             showsVerticalScrollIndicator={false}
//             refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
//           >
//             {employees.length === 0 ? (
//               <Text style={styles.noDataText}>{lang.no_staff_found}</Text>
//             ) : null}

//             {employees.map((u, idx) => {
//               const displayName = (u as any).fullname || `${(u as any).firstname ?? ""} ${(u as any).lastname ?? ""}`.trim();
//               const position = u.position ?? "";
//               const staffLabel = `Staff${(idx + 1).toString().padStart(2, "0")}`;

//               return (
//                 <TouchableOpacity
//                   key={u.id}
//                   onPress={() => openStaffProfile(u.id, userId, langId)}
//                 >
//                   <CartBox containerStyle={styles.detail_cartbox}>
//                     <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
//                       <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
//                         <Image source={require("../../../assets/images/profile2.png")} style={styles.profileImage} />
//                         <View style={styles.name_position}>
//                           <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
//                             {displayName}
//                           </Text>
//                           <Text style={styles.position}>{position}</Text>
//                         </View>
//                       </View>

//                       <View style={{ justifyContent: "center", alignItems: "flex-end" }}>
//                         <Text style={styles.staffLabel}>{staffLabel}</Text>
//                       </View>
//                     </View>
//                   </CartBox>
//                 </TouchableOpacity>
//               );
//             })}

//           </ScrollView>

//         </View>

//       </View>
//       {/* Floating Add button */}
//       <Button3
//         width={60}
//         height={60}
//         onPress={() => {
//           console.log("Button3 pressed -> openAddStaff");
//           openAddStaff();
//         }}
//       />
//     </View>
//   );
// };
// screens/admin/main/StaffRecordScreen.tsx
// screens/admin/main/StaffRecordScreen.tsx
// screens/admin/main/StaffRecordScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import CartBox from "../../../components/CartBox";
import fonts from "../../../styles/Fonts";
import { useNavigation, useRoute } from "@react-navigation/native";
import translations from "../../../assets/translations.json";
import { showSuccessToast } from "../../../components/Toast";
import Button3 from "../../../components/Button";
import SearchBar from "../../../components/SearchBar";
import { setAuthToken, initializeAuthFromStorage } from "../../../api/axiosInstance";
import { fetchUsers, User } from "../../../api/Users";

/**
 * Default branch id to show if route/props do not provide one.
 * (As requested: branch id - 68f8a8e7f22b67a44fbd3ef4)
 */
const DEFAULT_BRANCH_ID = "68f8a8e7f22b67a44fbd3ef4";

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

  // route may pass branch id under multiple names
  const passedBranchId = route.params?.branch_id ?? route.params?.branchId ?? null;
  const lang = (translations as any)[langId] || (translations as any)["en"];

  // state
  const [users, setUsers] = useState<User[]>([]);
  // 1) add this state near other useState calls
  const [sampleUserId, setSampleUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [version, setVersion] = useState<number>(0);
  const [query, setQuery] = useState<string>("");
  const [refreshing, setRefreshing] = useState<boolean>(false);


  // activeBranchId: default to passedBranchId if present, otherwise DEFAULT_BRANCH_ID
  const [activeBranchId, setActiveBranchId] = useState<string | null>(passedBranchId ?? DEFAULT_BRANCH_ID);

  // Helper: safe find (prevents calling .find on undefined)
  const safeFind = <T,>(arr: T[] | undefined | null, predicate: (item: T) => boolean): T | undefined => {
    if (!Array.isArray(arr)) return undefined;
    return arr.find(predicate);
  };

  // load users from API
  const loadUsers = async () => {
    setLoading(true);
    try {
      const fetched = await fetchUsers({ page: 1, limit: 200 });
      const safeFetched = Array.isArray(fetched) ? fetched : [];
      setUsers(safeFetched);

      if (safeFetched.length > 0) {
        console.log("StaffRecordScreen.loadUsers -> sample:", safeFetched[0]);
        // store the sample id for later use (defensive)
        const sampleId = (safeFetched[0] as any)?.id ?? null;
        if (sampleId) {
          setSampleUserId(sampleId);
          console.log("StaffRecordScreen.loadUsers -> sample id stored as sampleUserId:", sampleId);
        }
      }

      // debug logging (remove or comment out in production if noisy)
      console.log("StaffRecordScreen.loadUsers -> fetched count:", safeFetched.length);
      if (safeFetched.length > 0) console.log("StaffRecordScreen.loadUsers -> sample:", safeFetched[0]);

      // If you want the user's branch (based on userId) to override the default when no passedBranchId:
      // Only do this if passedBranchId is not provided.
      if (!passedBranchId && userId) {
        const current = safeFind(safeFetched, (u: User) => (u && u.id) === userId);
        if (current && (current as any).branch_id) {
          setActiveBranchId((current as any).branch_id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch users", err);
      setUsers([]); // fail-safe
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    // OPTION A: temporarily set the token you gave right now
    const immediateToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZjhhMTFhNzY0ODMzMGFjOWQ2MDM4NiIsImVtYWlsIjoiamV5YXJ1YmFucnViYW40OUBnbWFpbC5jb20iLCJyb2xlIjoic3VwZXJhZG1pbiIsImlhdCI6MTc2MTI3NjA5OCwiZXhwIjoxNzYxODgwODk4fQ.oItcp0tcPnPZwgF78_7y_s-ODyVVL8stGR82jqQdoGo";
    setAuthToken(immediateToken); // sets for this session + persists

    // Optionally also initialize from storage if you prefer:
    // initializeAuthFromStorage(); // (async) - not needed if you already set token
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // If route later provides a branch id explicitly, respect it.
    if (passedBranchId) setActiveBranchId(passedBranchId);
  }, [passedBranchId]);

  // employees list (defensive: users is always an array here)
  const employees = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Array.isArray(users) ? users : [];
    return list
      .filter((u) => u?.role === "user") // per your request
      .filter((u) => {
        const branchId = (u as any)?.branch_id ?? (u as any)?.branch?._id ?? null;
        if (activeBranchId && branchId !== activeBranchId) return false;
        return true;
      })
      .filter((u) => {
        if (!q) return true;
        const name = u.fullname ?? `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim();
        const full = `${name} ${u.position ?? ""}`.toLowerCase();
        return full.includes(q);
      });
  }, [users, query, version, activeBranchId]);

  const navAndLog = (routeName: string, params?: any) => {
    const allParams = { ...(params || {}), userId, langId };
    console.log(`Navigate -> ${routeName}`, allParams);
    navigation.navigate(routeName as any, allParams);
  };

  const openAddStaff = () => {
    console.log("Navigate -> AddStaffScreen", { userId, langId, mode: "create" });
    navigation.navigate("AddStaffScreen" as any, {
      userId,
      langId,
      onSave: (newStaff: Partial<User> & { id?: string; firstname: string; lastname: string; position?: string; role?: string }) => {
        // local update fallback
        if (newStaff.id) {
          const idx = users.findIndex((u) => u.id === newStaff.id);
          if (idx !== -1) {
            const updated = {
              ...users[idx],
              firstname: newStaff.firstname ?? users[idx].firstname,
              lastname: newStaff.lastname ?? users[idx].lastname,
              position: newStaff.position ?? users[idx].position,
              role: newStaff.role ?? users[idx].role,
              updateDate: new Date().toISOString(),
            } as any;
            const copy = [...users];
            copy[idx] = updated;
            setUsers(copy);
            setVersion((v) => v + 1);
            showSuccessToast("Staff updated");
            return;
          }
        }

        const newId = `U${(users.length + 1).toString().padStart(3, "0")}`;
        const payload: User = {
          id: newId,
          fullname: `${newStaff.firstname ?? "New"} ${newStaff.lastname ?? "Staff"}`.trim(),
          phone: (newStaff as any)["phone"] ?? "",
          email: (newStaff as any)["email"] ?? "",
          username: ((newStaff.firstname ?? "user") as string).toLowerCase(),
          role: (newStaff.role as any) ?? "user",
          position: newStaff.position ?? "",
          branch_id: (newStaff as any).branch_id ?? activeBranchId ?? (users[0] as any)?.branch_id ?? null,
          createDate: new Date().toISOString(),
          updateDate: new Date().toISOString(),
        } as any;
        setUsers((prev) => [payload, ...prev]);
        setVersion((v) => v + 1);
        showSuccessToast("Staff added");
      },
    });
  };

  // replace the existing openStaffProfile with this version
const openStaffProfile = (staffId: string, userIdParam: string | null, langIdParam: string) => {
  // find the staff from current users state (defensive)
  const staff = Array.isArray(users) ? users.find((u) => u.id === staffId) : undefined;

  // build a readable fullname fallback
  const fullname =
    staff?.fullname && staff.fullname.trim().length > 0
      ? staff.fullname
      : `${(staff?.firstname ?? "").trim()} ${(staff?.lastname ?? "").trim()}`.trim() || "Unknown";

  // decide which userId to pass: prefer explicit userIdParam, otherwise use sampleUserId (if any), otherwise original userId
  const UserId =  sampleUserId;

  // log the fullname and the chosen userId (so console shows the sample id when available)
  console.log("CartBox pressed -> StaffProfileScreen", {
    id: staffId,
    UserId: UserId,
    langId: langIdParam,
    fullname,
  });

  // proceed with navigation and include chosenUserId so the screen receives it
  //navAndLog("StaffProfileScreen", { id: staffId, userId: UserId, langId: langIdParam });
};


  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadUsers();
      setQuery("");
      setVersion((v) => v + 1);
    } finally {
      setRefreshing(false);
    }
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
          onPress: () => navAndLog("NotificationScreen", { userId, langId, activeBranchId }),
        }}
      />

      <View style={styles.container}>
        <View style={styles.body}>
          <View style={styles.searchWrap}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={lang.search_placeholder} />
          </View>

          {loading ? (
            <View style={{ marginTop: 20, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <ScrollView
              style={{ marginTop: 12, marginBottom: "15%" }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            >
              {employees.length === 0 ? <Text style={styles.noDataText}>{lang.no_staff_found}</Text> : null}

              {employees.map((u, idx) => {
                const displayName = u.fullname || `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim();
                const position = u.position ?? "";
                const staffLabel = `Staff${(idx + 1).toString().padStart(2, "0")}`;

                return (
                  <TouchableOpacity key={u.id} onPress={() => openStaffProfile(u.id, userId, langId)}>
                    <CartBox containerStyle={styles.detail_cartbox}>
                      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                          <Image source={require("../../../assets/images/profile2.png")} style={styles.profileImage} />
                          <View style={styles.name_position}>
                            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                              {displayName}
                            </Text>
                            <Text style={styles.position}>{position}</Text>
                          </View>
                        </View>

                        <View style={{ justifyContent: "center", alignItems: "flex-end" }}>
                          <Text style={styles.staffLabel}>{staffLabel}</Text>
                        </View>
                      </View>
                    </CartBox>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>

      <Button3 width={60} height={60} onPress={openAddStaff} />
    </View>
  );
};
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

export default StaffRecordScreen;
