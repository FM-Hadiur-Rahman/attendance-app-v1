import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Text, Image, Dimensions, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import colors from '../../../styles/Colors';
import Header from '../../../components/Header';
import Popup from '../../../components/Popup';
import { Button1 } from '../../../components/Button';
import { useNavigation, useRoute } from '@react-navigation/native';
import fonts from '../../../styles/Fonts';
import { users } from '../../../api/Users';
import translations from "../../../assets/translations.json";
import CartBox from '../../../components/CartBox';
import { workHours } from "../../../api/WorkHours";
import { branches } from '../../../api/Branch';

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

    const user = users.find((u) => u.id === userId) || users[0];

    const routeLangId = route.params?.langId ?? route.params?.language;
    const initialLang = (propLangId || routeLangId || "en") as LangId;

    const [selectedLanguage, setSelectedLanguage] = useState<LangId>(initialLang);
    const [tempLanguage, setTempLanguage] = useState<LangId>(selectedLanguage);
    const [logoutPopupVisible, setLogoutPopupVisible] = useState(false);

    const lang = translations[selectedLanguage];

    const [refreshing, setRefreshing] = useState<boolean>(false);

    const refreshFromServer = async () => {
        // TODO: replace with real API calls that fetch latest users, branches, workHours, etc.
        await new Promise((res) => setTimeout(res, 700));
    };

    const onRefresh = async () => {
        try {
            setRefreshing(true);
            // If parent supplied a refresh function, prefer that
            if (typeof (props as any).onRefreshData === "function") {
                await (props as any).onRefreshData();
            } else {
                // run the placeholder server-refresh logic (replace with real fetches)
                await refreshFromServer();
            }
            // Force recalculation of useMemo dependents
            setVersion((v) => v + 1);
        } catch (err) {
            console.warn("Refresh failed:", err);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (propLangId && propLangId !== selectedLanguage) {
            setSelectedLanguage(propLangId as LangId);
            setTempLanguage(propLangId as LangId);
        }
    }, [propLangId, selectedLanguage]);

    const [version, setVersion] = useState<number>(0);

    // total employees (global)
    const totalStaff = useMemo(
        () => users.filter((u) => u.role === "employee").length,
        [version]
    );

    const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const toYMD = (d: Date) =>
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

    // today's date in local timezone (Y-M-D)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayYMD = toYMD(today);

    // staff work hours for today (global)
    const todaysWorkHours = useMemo(
        () => workHours.filter((w) => w.date === todayYMD),
        [todayYMD, version]
    );

    // Helper: compute per-branch counts
    const branchCounts = useMemo(() => {
        return branches.map((branch) => {
            const totalEmployees = users.filter(
                (u) => u.role === 'employee' && u.branch_id === branch.id
            ).length;

            // unique user ids who have a workHours entry today and belong to this branch
            const workingUserIds = new Set<string>();
            todaysWorkHours.forEach((wh) => {
                const u = users.find((usr) => usr.id === wh.user_id);
                if (u && u.branch_id === branch.id) {
                    workingUserIds.add(wh.user_id);
                }
            });

            const todayWorking = workingUserIds.size;

            return {
                branchId: branch.id,
                branchName: branch.name,
                totalEmployees,
                todayWorking,
            };
        });
    }, [todaysWorkHours, version]);

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
                        <Text style={styles.total_count}>{totalStaff}</Text>
                    </CartBox>

                    <CartBox containerStyle={styles.staff}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Image
                                source={require("../../../assets/icons/staff_tik_g.png")}
                                style={styles.icon}
                            />
                            <Text style={styles.total_staff} ellipsizeMode="tail" numberOfLines={1}>{lang.staff_on_shift}</Text>
                        </View>

                        <Text style={styles.shift_count}>{todaysWorkHours.length}</Text>
                    </CartBox>
                </View>

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

                        {/* Render each branch's CartBox with real data */}
                        {branchCounts.map((b) => (
                            <TouchableOpacity
                                key={b.branchId}
                                onPress={() => {
                                    const navParams = {
                                        branch_id: b.branchId,
                                        userId: user?.id,
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
                                        {/* employees on schedule today */}
                                        <Text style={styles.count}>{b.todayWorking}</Text>
                                        <Text style={styles.count}>/</Text>
                                        {/* total employee count on each branch */}
                                        <Text style={styles.count}>{b.totalEmployees}</Text>
                                    </View>
                                </CartBox>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>

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
                        onPress={() => {
                            setLogoutPopupVisible(false);
                            navigation.reset({
                                index: 0,
                                routes: [{ name: "LoginScreen", params: { langId: selectedLanguage } }],

                            });
                            console.log('Logout -> received params:', { userId, langId: selectedLanguage });
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
        fontWeight: fonts.weight.regular as any,
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
        fontWeight: fonts.weight.regular as any,
        fontSize: 14,
        marginLeft: 8,
        width: "75%"
    },
    total_count: {
        fontWeight: fonts.weight.medium as any,
        fontSize: fonts.size.xxl,
        color: colors.primary,
        marginTop: 8,
    },
    shift_count: {
        fontWeight: fonts.weight.medium as any,
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
        fontWeight: fonts.weight.regular as any,
    },
    count: {
        color: colors.primary,
        fontSize: fonts.size.xxl,
        fontWeight: fonts.weight.medium as any,
    },
});
