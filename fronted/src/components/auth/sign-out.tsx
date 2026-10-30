import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { useSession } from '@/utils/ctx';
import Loading from '@/components/shared/Loading';
import { Alert } from 'react-native';

export default function SignOut() {
  const { signOut } = useSession();
  const router = useRouter();

  useEffect(() => {
    const handleSignOut = async () => {
      await signOut();

      Alert.alert('提示', '登录超时，请重新登录！', [
        {
          text: 'OK',
          onPress: async () => {
            router.navigate('/users');
          },
        },
      ]);
    };

    void handleSignOut();
  }, []);

  return <Loading />;
}
