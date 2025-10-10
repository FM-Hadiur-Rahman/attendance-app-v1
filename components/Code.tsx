// components/common/Codes_C.tsx
import React, { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';

import translations from '../assets/translations.json';
import Header from './Header';
import colors from '../styles/Colors';

type RootStackParamList = {
  Country_CodeScreen: { selectedLang: string };
};

export interface CountryItem {
  id: number;
  name: string;
  code: string;
  flag: any;
}

export interface CodesCProps {
  onSelect?: (item: CountryItem) => void;
  onClose?: () => void;
  initialSelectedId?: number;
}

const countryList: CountryItem[] = [
  { id: 1, name: 'Deutsch', code: '49', flag: require('../assets/icons/de.png') },
  { id: 2, name: 'Français', code: '33', flag: require('../assets/icons/c_French.png') },
  { id: 3, name: 'English', code: '44', flag: require('../assets/icons/en.png') },
  { id: 4, name: 'العربية', code: '966', flag: require('../assets/icons/c_Arabic.png') },
  { id: 5, name: 'Русский', code: '7', flag: require('../assets/icons/c_Russian.png') },
  { id: 6, name: 'Türkçe', code: '90', flag: require('../assets/icons/c_Turkish.png') },
  { id: 7, name: 'Srilanka', code: '94', flag: require('../assets/icons/c_lion.png') },
];

const Code: React.FC<CodesCProps> = (props) => {
  const navigation = useNavigation();


  const route = useRoute<RouteProp<RootStackParamList, 'Code'>>();
  const { selectedLang } = route.params || { selectedLang: 'en'};
  const lang = translations[selectedLang] || translations['en'];

  // Allow props OR route.params
  const onSelect = props.onSelect || route.params?.onSelect;
  const onClose =
  props.onClose ||
  route.params?.onClose ||
  (() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      console.log('No navigator to go back to, closing screen');
    }
  });
  const initialSelectedId =
  props.initialSelectedId ?? route.params?.initialSelectedId ?? null;

  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId);
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

//   const choose = (item: CountryItem) => {
//   setSelectedId(item.id); // update state so radio button updates immediately

//   if (typeof onSelect === 'function') {
//     onSelect(item);
//   }

//   // Delay closing slightly so UI shows change before navigation
//   setTimeout(() => {
//     if (typeof onClose === 'function') {
//       onClose();
//     }
//   }, 50);
// };
const choose = (item: CountryItem) => {
  setSelectedId(item.id);

  if (typeof onSelect === "function") {
    onSelect(item);  // 👈 This updates selectedCountry in AddStaffScreen
  }

  setTimeout(() => {
    if (typeof onClose === "function") {
      onClose();
    }
  }, 50);
};


  return (
    <View style={styles.container}>
       <Header
          left={[
                    {
                      type: 'image',
                      url: require('../assets/icons/back_b.png'),
                       width: 23, 
                       height: 23,
                      onPress: () => navigation.goBack(),
                    },

                  ]}
                  center={{ type: 'text', value: "Country Code", color: colors.text }}
              />

      <View style={{ height: isTablet ? 40 : 20 }} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: isTablet ? 40 : 20,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {countryList.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.frame,
              {
                paddingHorizontal: isTablet ? 28 : 20,
                height: isTablet ? 56 : 42,
              },
            ]}
            onPress={() => choose(item)}
            activeOpacity={0.7}
          >
            <Image
              source={
                selectedId === item.id
                  ? require('../assets/icons/radio_active.png')
                  : require('../assets/icons/radio.png')
              }
              style={{
                width: isTablet ? 18 : 16,
                height: isTablet ? 18 : 16,
                marginRight: isTablet ? 10 : 8,
              }}
            />
            <Image
              source={item.flag}
              style={{
                width: isTablet ? 24 : 17,
                height: isTablet ? 24 : 17,
                marginLeft: 8,
              }}
            />
            <Text
              style={[
                styles.countryName,
                {
                  fontSize: isTablet ? 18 : 14,
                  marginLeft: isTablet ? 12 : 8,
                },
              ]}
            >
              {item.name}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.countryCode, { fontSize: isTablet ? 18 : 14 }]}>
              {item.code}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

export default Code;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  frame: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    borderRadius: 12,
    backgroundColor: colors.background,
    paddingVertical: 10,
    marginBottom: 12,
    shadowColor: colors.text,
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
  },
  countryName: {
    fontFamily: 'Montserrat',
    color: colors.text,
  },
  countryCode: {
    fontFamily: 'Montserrat',
    color: colors.text,
  },
});
