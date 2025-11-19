// screens/LanguageScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  SafeAreaView,
  Dimensions,
  TouchableOpacity,
  Platform,
  StatusBar,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Button1 } from "../components/Button";
import colors from "../styles/Colors";
import fonts from "../styles/Fonts";
import CartBox from "../components/CartBox";

const { width, height } = Dimensions.get("window");

type LangId = "en" | "de";
const { width: deviceWidth } = Dimensions.get("window");
const base = deviceWidth / 440;

const LanguageScreen: React.FC = () => {
  const navigation = useNavigation();
  const [selected, setSelected] = useState<LangId>("en");

  const handleSelect = () => {
    console.log("Selected language id:", selected);
    // navigate to OpenScreen with param
    // @ts-ignore
    navigation.navigate("OpenScreen", { langId: selected });
  };

  return (
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
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Image
            source={require("../assets/images/o_language.png")}
            style={styles.langimage}
          />
          <Text style={styles.title}>Lanaguage</Text>

          <Text style={styles.subtitle}>
            Choose how you’d like to view the app
          </Text>
          {/* Language option 1 - English */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.langCard,
              selected === "en" && styles.langCardSelected,
            ]}
            onPress={() => setSelected("en")}
          >
            <View style={styles.langRow}>
              <Image
                source={require("../assets/icons/en.png")}
                style={styles.langIcon}
                resizeMode="contain"
              />

              <View style={styles.langGroup}>
                <Text style={styles.langTitle}>English</Text>
                <Text style={styles.langSubtitle}>English (UK)</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Language option 2 - German */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.langCard,
              selected === "de" && styles.langCardSelected,
            ]}
            onPress={() => setSelected("de")}
          >
            <View style={styles.langRow}>
              <Image
                source={require("../assets/icons/de.png")}
                style={styles.langIcon}
                resizeMode="contain"
              />

              <View style={styles.langGroup}>
                <Text style={styles.langTitle}>Deutsch</Text>
                <Text style={styles.langSubtitle}>German</Text>
              </View>
            </View>
          </TouchableOpacity>
        </ScrollView>

        {/* Spacer + Select button */}
        <View style={styles.buttonWrap}>
          <Button1 text="Select" width={"100%"} onPress={handleSelect} />
        </View>
      </CartBox>
    </View>
  );
};

export default LanguageScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    backgroundColor: colors.primary,
  },
  topImage: {
    width: "100%",
  },
  modalCart: {
    flex: 1,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-start",
    backgroundColor: colors.secondary,
    width: "100%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 30,
    paddingRight: 20,
    height: "70%",
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
  bottomoverlay: {
    width: "90%",
    marginLeft: 20,
    marginRight: 20,
    height: "100%",
    backgroundColor: colors.secondary,
    zIndex: 1,
    elevation: 2,
    opacity: 0.3,
    borderRadius: 30,
  },
  title: {
    color: colors.text,
    fontWeight: fonts.weight.medium as any,
    fontSize: fonts.size.xl,
    textAlign: "center",
  },
  subtitle: {
    color: colors.subtext2,
    fontWeight: fonts.weight.medium as any,
    fontSize: fonts.size.l,
    marginTop: 8,
    marginBottom: 20,
    textAlign: "center",
  },
  langCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    width: "100%",
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 20,
    marginBottom: 12,
  
  },
  langCardSelected: {
    borderColor: colors.popupBorderColor,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  langIcon: {
    width: 17,
    height: 17,
    marginRight: 8,
  },
  langGroup: {
    flexDirection: "column",
  },
  langTitle: {
    color: colors.text,
    fontWeight: fonts.weight.regular as any,
    fontSize: fonts.size.m,
    marginBottom: 4,
  },
  langSubtitle: {
    color: colors.subtext,
    fontWeight: fonts.weight.regular as any,
    fontSize: fonts.size.s,
  },
  buttonWrap: {
    position: "absolute",
    bottom: 20,
    width: "100%",
    marginTop: 8,
    left: 20,
    right: 20,
  },
  langimage: {
    width: 308,
    height: 229,
    alignSelf: "center",
    marginBottom: 20,
  },
  topicon: {
    width: 143,
    height: 107,
    alignSelf: "center",
    marginTop: 80,
    marginBottom: 40,
  },
  scrollContent: {
    paddingBottom: 80, // prevent button cutoff when scrolling
   width:390 * base
  },
});
