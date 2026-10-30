import { ActivityIndicator, StyleSheet } from 'react-native';

/**
 * 加载中组件
 */
export default function Loading() {
  return <ActivityIndicator size="small" color="#1f99b0" style={styles.loading} />;
}

const styles = StyleSheet.create({
  loading: {
    backgroundColor: 'rgba(255, 255, 255, .8)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
});
