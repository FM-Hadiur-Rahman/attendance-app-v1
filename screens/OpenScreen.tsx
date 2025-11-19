// screens/main/OpenScreen.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  SafeAreaView,
  Dimensions,
  Platform,
  StatusBar,
  ScrollView,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Button1 } from "../components/Button";
import CartBox from "../components/CartBox";
import colors from "../styles/Colors";
import fonts from "../styles/Fonts";

const { width, height } = Dimensions.get("window");

type LangId = "en" | "de";

type RootStackParamList = {
  OpenScreen: { langId: LangId };
  LoginScreen: { langId?: LangId } | undefined;
};

const translations = require("../assets/translations.json");

const OpenScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "OpenScreen">>();
  const langId: LangId | undefined = route.params?.langId;

  // Pick language object; fallback to 'en' if undefined or missing
  const lang = translations[(langId as string) || "en"] ?? translations["en"];

  const handleGetStarted = () => {
    console.log("OpenScreen -> navigating to LoginScreen with langId:", langId);
    // @ts-ignore
    navigation.navigate("LoginScreen", { langId });
  };

  return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.container}>
                <View style={styles.topImage}>
                {/* Top image occupying about half the screen */}
                <Image
                    source={require("../assets/icons/o_logo_b.png")}
                    style={styles.topicon}
                />
                </View>
                <CartBox containerStyle={styles.bottomoverlay}></CartBox>
                {/* Bottom modal-like cart box */}
                <CartBox containerStyle={styles.modalCart}>

          {/* Use translations here */}
          <ScrollView style={{ marginBottom: "18%" }}>
            <Text style={styles.headline}>{lang.open_headline}</Text>
            <View style={styles.subhead_group}>
            <Text style={styles.subhead}>{lang.open_subhead1}</Text>
            <Text></Text>
            <Text style={styles.subhead}>{lang.open_subhead2}</Text>
              </View>
            <View style={styles.infoBox}>
              <Image
                source={require("../assets/icons/o_clock_b.png")}
                style={styles.infoIcon}
                resizeMode="contain"
              />
              <View style={styles.infoTextWrap}>
                <Text style={styles.infoTitle}>{lang.EasyCheckInCheckOut}</Text>
              </View>
            </View>

            <View style={styles.infoBox}>
              <Image
                source={require("../assets/icons/o_realtime_b.png")}
                style={styles.infoIcon}
                resizeMode="contain"
              />
              <View style={styles.infoTextWrap}>
                <Text style={styles.infoTitle}>{lang.real_time_activity_tracking}</Text>
              </View>
            </View>

            <View style={styles.infoBox}>
              <Image
                source={require("../assets/icons/o_detail_b.png")}
                style={styles.infoIcon}
                resizeMode="contain"
              />
              <View style={styles.infoTextWrap}>
                <Text style={styles.infoTitle}>{lang.detailed_timesheets_reports}</Text>
              </View>
            </View>
          </ScrollView>
        </CartBox>

        <View style={styles.fixedButton}>
          <Button1 text={lang.continue} width={"100%"} onPress={handleGetStarted} />
        </View>
      </View>
    </SafeAreaView>
  );
};

export default OpenScreen;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.primary,
    // paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
    position: 'relative',
  },
  topImage: {
  },
    modalCart: {
        flex: 1,
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'flex-start',
        backgroundColor: colors.secondary,
        width: "100%",
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        paddingTop: 30,
        paddingRight: 20,
        height: '70%',
        paddingLeft: 20,
        marginTop: 0, // pull up a bit so rounded corners overlap image nicely
        // Shadow
        ...Platform.select({
            ios: {
                shadowColor: colors.text,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 20,
            },
            android: {
                elevation: 8,
            },
        }),
        zIndex: 2,
        elevation: 20,
    },
    bottomoverlay:{
        width:'90%',
        marginLeft:20,
        marginRight:20,
        height:'100%',
        backgroundColor:colors.secondary,
        zIndex: 1,
        elevation: 2,
        opacity:0.3,
        borderRadius:30,
        borderWidth:1
    },
  logoWrap: {
    alignItems: "center",
  },
  logo: {
    width: 100,
    height: 100,
  },
  headline: {
    color: colors.text,
    fontWeight: fonts.weight.medium as any,
    fontSize: fonts.size.xl,
    textAlign: "center",
    marginBottom: 20,
  },
  subhead_group: {
    marginBottom: 20,
  },
  subhead: {
    color: colors.subtext2,
    fontWeight: fonts.weight.regular as any,
    fontSize: fonts.size.m,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    borderRadius: 16,
    paddingTop:10,
    paddingBottom:10,
    paddingLeft:10,
    marginBottom: 12,
    alignSelf:'flex-start',
    width:'100%',

  },
  infoIcon: {
    width: 30,
    height: 30,
    marginRight: 8,
  },
  infoTextWrap: {
    flexDirection: "column",
  },
  infoTitle: {
    color: colors.text,
    fontWeight: fonts.weight.regular as any,
    fontSize: fonts.size.s,
    marginBottom: 4,
  },
  fixedButton: {
    position: "absolute",
    paddingTop:10,
    paddingBottom:20,
    backgroundColor:colors.secondary,
    bottom: 0,
    left: 0,
    right: 0,
    paddingLeft:20,
    paddingRight:20,
    zIndex: 2,
    elevation: 20,
  },
    langimage:{
        width:308, height:229, alignSelf:'center', marginBottom:20,
    },
    topicon:{
        width:143, height:107, alignSelf:'center', marginTop:80, marginBottom:40,
    },
});
