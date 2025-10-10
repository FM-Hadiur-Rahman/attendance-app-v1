import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ImageSourcePropType,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Button1 } from './Button';
import colors from '../styles/Colors';
import fonts from '../styles/Fonts';
import CartBox from './CartBox';

export interface ContactCardProps {
  icon: ImageSourcePropType;
  label: string;
  value: string;
  buttonTitle: string;
  onPress: () => void;
}

const dummyContactValues = {
  phone: '0774412558',
  landline: '0774412558',
  email: 'example@gmail.com',
  website: 'https://www.apple.com/iphone-17-pro/',
};

export const contactList: ContactCardProps[] = [
  {
    icon: require('../assets/icons/c_phone.png'),
    label: 'Phone number',
    value: dummyContactValues.phone,
    buttonTitle: 'Call',
    onPress: () => Linking.openURL(`tel:${dummyContactValues.phone}`),
  },
  {
    icon: require('../assets/icons/c_landline.png'),
    label: 'Landline',
    value: dummyContactValues.landline,
    buttonTitle: 'Call',
    onPress: () => Linking.openURL(`tel:${dummyContactValues.landline}`),
  },
  {
    icon: require('../assets/icons/c_mail.png'),
    label: 'Email',
    value: dummyContactValues.email,
    buttonTitle: 'Mail',
    onPress: () => Linking.openURL(`mailto:${dummyContactValues.email}`),
  },
  {
    icon: require('../assets/icons/c_website.png'),
    label: 'Website',
    value: dummyContactValues.website,
    buttonTitle: 'Visit',
    onPress: () => Linking.openURL(`https://${dummyContactValues.website}`),
  },
];

const ContactCard = ({
  icon,
  label,
  value,
  buttonTitle,
  onPress,
}: ContactCardProps) => {
  return (
    <CartBox
      borderRadius={12}
      backgroundColor={colors.background}
      paddingVertical={10}
      paddingHorizontal={12}
      marginBottom={12}
      height={58}
      containerStyle={{
        shadowColor: colors.text,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0,
        shadowRadius: 1,
        elevation: 2,
      }}
    >
      <View style={styles.cardContent}>
        <View style={styles.leftSection}>
          <Image source={icon} style={styles.iconImage} />
          <View style={styles.textBlock}>
            <Text style={styles.label}>{label}</Text>
        <Text
  style={styles.value}
  numberOfLines={1}
  ellipsizeMode="tail"
>
  {value}
</Text>
            
          </View>
        </View>
        <Button1
          text={buttonTitle}
          backgroundColor={colors.primary}
          containerStyle={{
            borderRadius: 20,
            width: 70,
            height: 35,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 0,
          }}
          textStyle={{
            color: colors.secondary,
            fontSize: fonts.size.m,
            textAlign: 'center',
            paddingVertical: 4,
          }}
          onPress={onPress}
        />
      </View>
    </CartBox>
  );
};

export const GroupedContactList = ({ data }: { data?: ContactCardProps[] }) => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  // if data not passed, use default contactList
  const items = data ?? contactList;

  return (
    <View
      style={[
        styles.groupCardWrapper,
        {
          width: isTablet ? width * 0.9 : width * 0.95,
        },
      ]}
    >
      <Text style={styles.groupHeader}>Contact us</Text>

      {items.map((item, index) => (
        <ContactCard key={index} {...item} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  groupCardWrapper: {
    borderRadius: 16,
    padding: 16,
    alignSelf: 'center',
  },
  groupHeader: {
    fontSize: fonts.size.l,
    fontWeight: fonts.weight.bold as any,
    marginBottom: 12,
    color: colors.text,
    width: '100%'
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width : '95%'
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconImage: {
    width: 42,
    height: 42,
    resizeMode: 'contain',
    marginRight: 12,
  },
  textBlock: {
    justifyContent: 'center',
  },
  label: {
    fontSize: fonts.size.m,
    color: colors.text,
    fontWeight: fonts.weight.regular as any,
  },
value: {
    fontSize: fonts.size.m,
    color: colors.subtext,
    marginTop: 2,
    maxWidth:180,
},
});

export default ContactCard;
