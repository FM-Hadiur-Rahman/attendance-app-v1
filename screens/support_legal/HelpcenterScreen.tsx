import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Linking,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { contactList, GroupedContactList } from '../../components/Contact';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { toastConfig, showSuccessToast, showErrorToast } from '../../components/Toast';
import colors from '../../styles/Colors';
import Header from '../../components/Header';
import InputBox from '../../components/InputBox';
import { Button1 } from '../../components/Button';
import fonts from '../../styles/Fonts';


const SUPPORT_EMAIL = 'sanjeevanyogan@gmail.com';

type RouteParams = {
  params: {
    userId?: string;
    langId?: string;
  };
};
const translations = require('../../assets/translations.json');

const HelpCenterScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute() as RouteProp<RouteParams['params'], 'params'>;
  const { userId, langId } = route.params ?? {};

  // Log incoming params
  console.log('HelpCenterScreen -> received params:', { userId, langId });

  const lang = translations[(langId as string) || 'en'] ?? translations['en'];

  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string }>({});
  const [sending, setSending] = useState(false);

  const handleChange = (key: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const validate = () => {
    const { name, email, message } = formData;
    const newErrors: typeof errors = {};

    if (!name.trim()) newErrors.name = lang.err_name_required ?? 'Name is required.';

    if (!email.trim()) newErrors.email = lang.Email_is_required ?? 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = lang.err_invalid_email ?? 'Invalid email address.';

    if (!message.trim()) newErrors.message = lang.err_message_required ?? 'Message is required.';
    else if (message.trim().length < 10) newErrors.message = lang.err_message_length ?? 'Message must be at least 10 characters.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      showErrorToast(lang.Please_fill_all_fields_correctly ?? 'Please fill all fields correctly');
      console.log('HelpCenterScreen -> validation failed', { errors });
      return;
    }

    setSending(true);
    const { name, email, message } = formData;
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(lang.help_subject_prefix ?? 'Help Request from')} ${encodeURIComponent(
      name,
    )}&body=${encodeURIComponent(lang.name_label ?? 'Name')}: ${encodeURIComponent(name)}%0A${encodeURIComponent(lang.email_label ?? 'Email')}: ${encodeURIComponent(email)}%0A${encodeURIComponent(lang.message_label ?? 'Message')}: ${encodeURIComponent(
      message,
    )}`;

    try {
      console.log('HelpCenterScreen -> opening mailto:', mailto);
      const supported = await Linking.canOpenURL(mailto);
      if (supported) {
        await Linking.openURL(mailto);
        showSuccessToast(lang.toast_mail_client_opened ?? 'Mail client opened');
        console.log('HelpCenterScreen -> mail client opened');
        setFormData({ name: '', email: '', message: '' });
      } else {
        showErrorToast(lang.toast_no_mail_app ?? 'No mail app found');
        console.log('HelpCenterScreen -> no mail app found');
      }
    } catch (err) {
      console.error('HelpCenterScreen -> Error opening mail app', err);
      showErrorToast(lang.toast_mail_failed ?? 'Failed to open mail app');
    } finally {
      setSending(false);
    }
  };

  const { name, email, message } = formData;

  const iosInputStyle = Platform.OS === 'ios'
    ? { height: 36, lineHeight: 20 }
    : {};

  // State for refresh
  const [refreshing, setRefreshing] = useState(false);

  // Refresh function
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);


   return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      {/* Header */}
      <View style={styles.headerWrapper}>
        <Header
          backgroundColor={colors.secondary}
          position="relative"
          left={{
            type: 'image',
            url: require('../../assets/icons/back_b.png'),
            width: 24,
            height: 24,
            onPress: () => {
              console.log('HelpCenterScreen -> back pressed', { userId, langId });
              navigation.goBack();
            },
          }}
          center={{ type: 'text', value: lang.help_center ?? 'Help Center', color: colors.text }}
        />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressBackgroundColor={colors.secondary}
          />
        }
      >
        <View style={styles.entire_group}>
          {/* <Image
            source={require('../../assets/images/Help_center_image.gif')}
            style={styles.helpGif}
            resizeMode="contain"
          /> */}

          <Text style={styles.title}>{lang.lets_talk ?? "Let's talk"}</Text>

          <View style={styles.inputsContainer}>
            <InputBox
              label={lang.name_label ?? 'Name'}
              placeholder={lang.name_placeholder ?? 'eg; John'}
              value={name}
              style={{ width: '100%' }}
              setValue={text => handleChange('name', text)}
              borderColor={errors.name ? colors.error_text : colors.primary}
            />
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

            <InputBox
              label={lang.email_label ?? 'Email'}
              placeholder={lang.example_gmail ?? 'example@gmail.com'}
              value={email}
              setValue={text => handleChange('email', text)}
              borderColor={errors.email ? colors.error_text : colors.primary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

            <InputBox
              label={lang.message_label ?? 'How can we help?'}
              placeholder={lang.message_placeholder ?? 'Type here'}
              multiline
              inputStyle={{ height: 120 }}
              value={message}
              setValue={text => handleChange('message', text)}
              borderColor={errors.message ? colors.error_text : colors.primary}
            />
            {errors.message && <Text style={styles.errorText}>{errors.message}</Text>}
          </View>

          <View style={styles.contactListWrap}>
            <GroupedContactList data={contactList} lang={lang} />
          </View>
        </View>
      </ScrollView>

      {/* Fixed bottom send button */}
      <View style={[styles.buttonWrap, { paddingBottom: insets.bottom || 0 }]}>
        <Button1
          text={sending ? (lang.sending ?? 'Sending...') : (lang.send_button ?? 'Send')}
          width="90%"
          backgroundColor={colors.primary}
          textStyle={{ color: colors.secondary }}
          containerStyle={{ borderRadius: 6 }}
          onPress={handleSubmit}
          disabled={sending}
        />
      </View>

      <Toast config={toastConfig} />
    </KeyboardAvoidingView>
  );
};


const styles = StyleSheet.create({
  headerWrapper: { backgroundColor: colors.secondary },
  scrollContent: {
    paddingTop: 0,
  },
  entire_group: {
    backgroundColor: colors.secondary,
    paddingTop: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  helpGif: { width: 200, height: 200 },
  title: {
    fontSize: fonts.size.l,
    fontWeight: fonts.weight.semibold as never,
    color: colors.text,
    marginTop: 20,
    marginBottom: 12,
    fontFamily: fonts.family.regular,
    alignSelf: 'flex-start',
  },
  errorText: { color: colors.error_text, fontSize: 12, alignSelf: 'flex-start', marginBottom: 6 },
  contactListWrap: { width: '100%', marginTop: 0 },
  buttonWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    paddingTop: 20
  },
  inputsContainer: {
    width: "100%",
    paddingHorizontal: 0
  }
});

export default HelpCenterScreen;
