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
import { getBranchById, getAllBranches } from '../api/Branchs';


interface ContactLang {
  phoneNumber?: string;
  call?: string;
  email?: string;
  mail?: string;
  Contact_us?: string;
}

export interface ContactCardProps {
  icon: ImageSourcePropType;
  label: string;
  value: string;
  buttonTitle: string;
  onPress: () => void;
  lang?: ContactLang;
}
const translations = require('../assets/translations.json');

const dummyContactValues = {
  phone: 'undefined',
  // landline: '0774412558',
  email: 'undefined',
  // website: 'https://www.apple.com/iphone-17-pro/',
};

export const contactList: ContactCardProps[] = [
  {
    icon: require('../assets/icons/c_phone.png'),
    label: 'Phone number',
    value: dummyContactValues.phone,
    buttonTitle: 'Call',
    onPress: () => Linking.openURL(`tel:${dummyContactValues.phone}`),
  },
  // {
  //   icon: require('../assets/icons/c_landline.png'),
  //   label: 'Landline',
  //   value: dummyContactValues.landline,
  //   buttonTitle: 'Call',
  //   onPress: () => Linking.openURL(`tel:${dummyContactValues.landline}`),
  // },
  {
    icon: require('../assets/icons/c_mail.png'),
    label: 'Email',
    value: dummyContactValues.email,
    buttonTitle: 'Mail',
    onPress: () => Linking.openURL(`mailto:${dummyContactValues.email}`),
  },
  // {
  //   icon: require('../assets/icons/c_website.png'),
  //   label: 'Website',
  //   value: dummyContactValues.website,
  //   buttonTitle: 'Visit',
  //   onPress: () => Linking.openURL(`https://${dummyContactValues.website}`),
  // },
];

const ContactCard = ({
  icon,
  label,
  value,
  buttonTitle,
  onPress,
}: ContactCardProps) => (
    <CartBox
      borderRadius={12}
      backgroundColor={colors.background}
      paddingVertical={10}
      paddingHorizontal={12}
      marginBottom={12}
      height={58}
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

export const GroupedContactList = ({
  data,
  lang,
  branchId,
}: {
  data?: ContactCardProps[];
  lang?: ContactLang;
  branchId?: string | null;
}) => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  // if data not passed, use default contactList
  const templateItems = data ?? contactList;

  const [resolvedBranch, setResolvedBranch] = React.useState<{
    _id?: string;
    phone?: string;
    email?: string;
  } | null>(null);

  const [resolving, setResolving] = React.useState<boolean>(false);

  React.useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      setResolving(true);
      try {
        // try branch by id first
        if (branchId) {
          try {
            // console.log('GroupedContactList -> resolving branch by id', branchId);
            const b = await getBranchById(branchId);
            if (mounted && b) {
              setResolvedBranch({
                _id: b._id,
                phone: b.phone ?? null,
                email: b.email ?? null,
              });
              setResolving(false);
              return;
            }
          } catch (err) {
            //console.warn('GroupedContactList -> getBranchById failed', err);
            // continue to fallback
          }
        }

        // fallback: get all branches and pick first with useful contact info
        //console.log('GroupedContactList -> fetching all branches fallback');
        const all = await getAllBranches();
        if (!mounted) return;
        const first = all.find((x) => x.email || x.phone);
        if (first) {
          setResolvedBranch({
            _id: first._id,
            phone: first.phone ?? null,
            email: first.email ?? null,
          });
        } else {
          setResolvedBranch(null);
        }
      } catch (err) {
        // console.error('GroupedContactList -> error resolving branches', err);
        if (mounted) setResolvedBranch(null);
      } finally {
        if (mounted) setResolving(false);
      }
    };

    void resolve();
    return () => {
      mounted = false;
    };
  }, [branchId]);

  // build concrete items replacing dummy values when branch info available
  const itemsToRender: ContactCardProps[] = React.useMemo(() => templateItems.map(it => {
      const newItem = { ...it };

      // Replace phone/email values if branch info is available
      if (/phone/i.test(newItem.label) && resolvedBranch?.phone) {
        newItem.value = resolvedBranch.phone;
        newItem.onPress = () => Linking.openURL(`tel:${resolvedBranch.phone}`);
      }
      if (/email/i.test(newItem.label) && resolvedBranch?.email) {
        newItem.value = resolvedBranch.email;
        newItem.onPress = () => Linking.openURL(`mailto:${resolvedBranch.email}`);
      }

      // Translate labels
      if (lang) {
        if (/phone/i.test(newItem.label)) {
          newItem.label = lang.phoneNumber ?? 'Phone number';
          newItem.buttonTitle = lang.call ?? 'Call'; // translate button
        }
        if (/email/i.test(newItem.label)) {
          newItem.label = lang.email ?? 'Email';
          newItem.buttonTitle = lang.mail ?? 'Mail'; // translate button
        }
      }
      return newItem;
    }), [templateItems, resolvedBranch, lang]);

  return (
    <View
      style={[
        styles.groupCardWrapper,
        {
          width: isTablet ? width * 0.9 : width * 0.95,
        },
      ]}
    >
      <Text style={styles.groupHeader}>{lang?.Contact_us ?? 'Contact us'}</Text>

      {itemsToRender.map((item, index) => (
        <ContactCard key={index} {...item} />
      ))}

      {/* optional: show resolution status for debugging */}
      {/* {resolving && <Text style={{ color: colors.subtext, marginTop: 8 }}>Resolving branch contact...</Text>} */}
      {!resolving && !resolvedBranch && (
        <Text style={{ color: colors.subtext, marginTop: 8 }}>No branch contact found. Showing default contacts.</Text>
      )}
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
    fontWeight: fonts.weight.bold,
    marginBottom: 12,
    color: colors.text,
    width: '100%'
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '95%'
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
    fontWeight: fonts.weight.regular,
  },
  value: {
    fontSize: fonts.size.m,
    color: colors.subtext,
    marginTop: 2,
    maxWidth: 180,
  },
});

export default ContactCard;