import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useSession } from '@/utils/ctx';
import { t as tt } from '@/i18n';
import Loading from '@/components/shared/Loading';
import * as WebBrowser from 'expo-web-browser';

export default function SignUpForm(props) {
  const { setSelected } = props;
  const { signUp } = useSession();
  const [hidePassword, setHidePassword] = useState(true);
  const [agreedPolicy, setAgreedPolicy] = useState(false);
  const [formParams, setFormParams] = useState({
    email: '',
    username: '',
    nickname: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);

  /**
   * 表单输入
   * @param name 表单字段名
   * @param text 输入的内容
   */
  const onChangeText = (name, text) => {
    setFormParams((prev) => ({
      ...prev,
      [name]: text,
    }));
  };

  /**
   * 提交表单
   */
  const handleSubmit = () => {
    setLoading(true);
    signUp(formParams, setLoading);
  };

  return (
    <KeyboardProvider>
      <KeyboardAwareScrollView
        style={styles.container}
        bottomOffset={200}
        contentContainerStyle={styles.contentContainer}
      >
        {loading && <Loading />}

        <View style={styles.noticeWrapper}>
          <Text style={styles.notice}>{tt('auth.signup.hasAccount')} </Text>
          <MaterialCommunityIcons name={'arrow-right'} size={25} color={'#fff'} />
          <TouchableOpacity onPress={() => setSelected('signIn')}>
            <Text style={styles.noticeLink}>{tt('auth.signup.goSignIn')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{tt('auth.signup.heading')}</Text>
          <View style={styles.form}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>{tt('auth.signup.emailLabel')}</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input]}
                  placeholder={tt('auth.signup.emailPlaceholder')}
                  keyboardType={'email-address'}
                  autoCapitalize={'none'}
                  autoCorrect={false}
                  onChangeText={(text) => onChangeText('email', text)}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{tt('auth.signup.usernameLabel')}</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input]}
                  placeholder={tt('auth.signup.usernamePlaceholder')}
                  autoCapitalize={'none'}
                  autoCorrect={false}
                  onChangeText={(text) => onChangeText('username', text)}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{tt('auth.signup.nicknameLabel')}</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input]}
                  placeholder={tt('auth.signup.nicknamePlaceholder')}
                  keyboardType={'email-address'}
                  autoCapitalize={'none'}
                  autoCorrect={false}
                  onChangeText={(text) => onChangeText('nickname', text)}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{tt('auth.signup.passwordLabel')}</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input]}
                  placeholder="・・・・・・・・"
                  autoCapitalize={'none'}
                  autoCorrect={false}
                  secureTextEntry={hidePassword}
                  onChangeText={(text) => onChangeText('password', text)}
                />
                <TouchableWithoutFeedback onPress={() => setHidePassword(!hidePassword)}>
                  <View style={styles.eyeIcon}>
                    <MaterialCommunityIcons
                      name={hidePassword ? 'eye-off' : 'eye-outline'}
                      size={24}
                      color={'#333'}
                    />
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </View>
          </View>

          <TouchableWithoutFeedback disabled={!agreedPolicy} onPress={handleSubmit}>
            <View style={[styles.submitWrapper, agreedPolicy && styles.canSubmitWrapper]}>
              <Text style={[styles.submit, agreedPolicy && styles.canSubmit]}>{tt('auth.signup.submit')}</Text>
            </View>
          </TouchableWithoutFeedback>

          <TouchableWithoutFeedback onPress={() => setAgreedPolicy(!agreedPolicy)}>
            <View style={styles.privacyWrapper}>
              <MaterialCommunityIcons
                name={agreedPolicy ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                size={16}
                color={agreedPolicy ? '#629BF0' : '#999'}
                style={styles.privacyCheckbox}
              />
              <Text style={styles.privacyText}>{tt('auth.agree.prefix')}</Text>
              <TouchableOpacity
                onPress={() => WebBrowser.openBrowserAsync('https://clwy.cn/rules')}
              >
                <Text style={styles.privacy}>{tt('auth.agree.terms')}</Text>
              </TouchableOpacity>
              <Text style={styles.privacyText}>{tt('auth.agree.and')}</Text>
              <TouchableOpacity
                onPress={() => WebBrowser.openBrowserAsync('https://clwy.cn/privacy')}
              >
                <Text style={styles.privacy}>{tt('auth.agree.privacy')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </KeyboardAwareScrollView>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  content: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  cancel: {
    alignSelf: 'flex-end',
    color: '#629BF0',
  },
  title: {
    fontSize: 28,
    marginTop: 28,
  },
  form: {
    marginTop: 29,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
  },
  inputWrapper: {
    position: 'relative',
  },
  input: {
    fontSize: 15,
    fontWeight: '300',
    color: '#404044',
    backgroundColor: '#F8F8F8',
    height: 50,
    marginTop: 6,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
  },
  inputFocused: {
    borderBottomColor: '#629BF0',
  },
  eyeIcon: {
    position: 'absolute',
    right: 15,
    top: 20,
    backgroundColor: 'transparent',
  },
  inputIcon: {
    position: 'absolute',
    right: 15,
    top: 20,
    color: '#DEDEE2',
  },
  inputIconSuccess: {
    color: '#629BF0',
  },
  forgetPassword: {
    fontSize: 12,
    color: '#629BF0',
    fontWeight: 'bold',
    textAlign: 'right',
    marginTop: 5,
  },
  submitWrapper: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#AACAF7',
    width: 206,
    height: 48,
    alignSelf: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  submit: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: 'bold',
    color: '#AACAF7',
  },
  canSubmitWrapper: {
    borderColor: '#629BF0',
  },
  canSubmit: {
    color: '#629BF0',
  },
  privacyWrapper: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  privacyCheckbox: {
    marginRight: 4,
  },
  privacyText: {
    fontSize: 12,
    color: '#999',
  },
  privacy: {
    fontSize: 12,
    color: '#629BF0',
    fontWeight: 'bold',
    marginHorizontal: 2,
  },
  noticeWrapper: {
    height: 48,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#9DC5F7',
  },
  notice: {
    color: '#fff',
    fontSize: 12,
  },
  noticeLink: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
});
