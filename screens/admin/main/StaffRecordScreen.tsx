// screens/admin/main/StaffRecordScreen.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import CartBox from "../../../components/CartBox";
import fonts from "../../../styles/Fonts";
import { users as usersArr, User } from "../../../api/Users";
import { useNavigation, useRoute } from "@react-navigation/native";
import translations from "../../../assets/translations.json";

import { showSuccessToast } from "../../../components/Toast";
import Button3 from "../../../components/Button";
import SearchBar from "../../../components/SearchBar";

const StaffRecordScreen: React.FC = (props: any) => {
  const navigation = useNavigation<any>();
    const route = useRoute<any>();

  // support prop-based injection (Footer) or fallback to route params
  const propUserId = (props as any)?.userId;
  const propLangId = (props as any)?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;

  const userId = propUserId || routeUserId || null;
  const langId = propLangId || routeLangId || "en";

  // translation dictionary for this screen
  const lang = (translations as any)[langId] || (translations as any)["en"];


  // local "version" to force re-compute when usersArr mutated
  const [version, setVersion] = useState<number>(0);

  // search text
  const [query, setQuery] = useState<string>("");

  // refresh state
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Compute employee list from users mock, filtered by search
  const employees = useMemo(() => {
    const q = query.trim().toLowerCase();
    return usersArr
      .filter((u) => u.role === "employee")
      .filter((u) => {
        if (!q) return true;
        const full = `${u.firstname} ${u.lastname} ${u.position}`.toLowerCase();
        return full.includes(q);
      });
  }, [version, query]);

  const navAndLog = (routeName: string, params?: any) => {
    const allParams = { ...(params || {}), userId, langId };
    console.log(`Navigate -> ${routeName}`, allParams);
    navigation.navigate(routeName as any, allParams);
  };


  // Floating button -> open AddStaffScreen
  const openAddStaff = () => {
    console.log("Navigate -> AddStaffScreen", { userId, langId, mode: "create" });
    navigation.navigate("AddStaffScreen" as any, {userId,langId,
      onSave: (newStaff: Partial<User> & { id?: string; firstname: string; lastname: string; position?: string; role?: "employee" | "admin" }) => {
        // if id provided and exists -> update
        if (newStaff.id) {
          const idx = usersArr.findIndex((u) => u.id === newStaff.id);
          if (idx !== -1) {
            usersArr[idx] = {
              ...usersArr[idx],
              firstname: newStaff.firstname,
              lastname: newStaff.lastname,
              position: newStaff.position ?? usersArr[idx].position,
              role: (newStaff.role as any) ?? usersArr[idx].role,
              updateDate: new Date().toISOString(),
            } as any;
            setVersion((v) => v + 1);
            showSuccessToast("Staff updated");
            console.log("AddStaffScreen -> updated staff", usersArr[idx]);
            return;
          }
          // id provided but not found -> fallthrough to create new
        }

        // create new staff ID
        const newId = `U${(usersArr.length + 1).toString().padStart(3, "0")}`;
        const payload: User = {
          id: newId,
          firstname: newStaff.firstname ?? "New",
          lastname: newStaff.lastname ?? "Staff",
          phone: newStaff["phone"] ?? "",
          email: newStaff["email"] ?? "",
          username: (newStaff.firstname ?? "user").toLowerCase(),
          password: "Pass@123",
          role: (newStaff.role as any) ?? "employee",
          position: newStaff.position ?? "",
          createDate: new Date().toISOString(),
          updateDate: new Date().toISOString(),
        };
        usersArr.push(payload as any);
        setVersion((v) => v + 1);
        showSuccessToast("Staff added");
        console.log("AddStaffScreen -> added staff", payload);
      },
    });
  };

  // When clicking on a CartBox -> open StaffProfileScreen with id
  // const openStaffProfile = (staffId: string) => {
  //   console.log("CartBox pressed -> StaffProfileScreen", { id: staffId });
  //   navAndLog("StaffProfileScreen", { id: staffId });
  // };
    const openStaffProfile = (staffId: string, userId: string, langId: string) => {
    const params = { id: staffId, userId, langId };
    console.log("CartBox pressed -> StaffProfileScreen", params);
    navAndLog("StaffProfileScreen", params);
  };


  // Pull-to-refresh: clear search and refresh view
  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setQuery("");
    // bump version to re-render from the global usersArr if mutated externally
    setVersion((v) => v + 1);
    setRefreshing(false);
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
            console.log("Header right pressed -> NotificationScreen", { userId, langId });
            navAndLog("NotificationScreen", {userId, langId});
          },
        }}
      />

      <View style={styles.container}>
        <View style={styles.body}>
          <View style={styles.searchWrap}>
            {/* Use existing SearchBar component and wire it to query */}
            <SearchBar value={query} onChangeText={setQuery} placeholder={lang.search_placeholder} />
          </View>

          <ScrollView
            style={{ marginTop: 12, marginBottom: '15%' }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          >
            {employees.length === 0 ? (
              <Text style={styles.noDataText}>{lang.no_staff_found}</Text>
            ) : null}

            {employees.map((u, idx) => {
  const displayName = u.fullname || `${u.firstname} ${u.lastname}`;
  const position = u.position ?? "";
  const staffLabel = `Staff${(idx + 1).toString().padStart(2, "0")}`;

  return (
    <TouchableOpacity
      key={u.id}
      onPress={() => openStaffProfile(u.id, userId, langId)}
    >
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

        </View>

      </View>
      {/* Floating Add button */}
      <Button3
        width={60}
        height={60}
        onPress={() => {
          console.log("Button3 pressed -> openAddStaff");
          openAddStaff();
        }}
      />
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
