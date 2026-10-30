import { useEffect, useState, useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Polyline, Svg, Line } from 'react-native-svg';

import { getCoin, getMarketChart } from '@/utils/coingecko';
import { useTheme, formatPercent } from '@/utils/theme';

/** 币种详情：走势图（带发光）+ 概览/更多数据双列网格 + 简介 */
export default function CoinDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const [coin, setCoin] = useState(null);
  const [prices, setPrices] = useState([]);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getCoin(id), getMarketChart(id)])
      .then(([detail, chart]) => {
        if (!active) return;
        setCoin(detail);
        setPrices(chart);
      })
      .catch(() => setError(true));
    return () => {
      active = false;
    };
  }, [id]);

  const chart = useMemo(() => {
    if (prices.length < 2) return null;
    const values = prices.map(([, p]) => p);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const W = 300;
    const H = 200;
    const points = prices
      .map(([, p], i) => {
        const x = (i / (prices.length - 1)) * W;
        const y = H - ((p - min) / span) * H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    // 参考项目：线色由 7 天首尾价差决定（涨绿跌红）
    const lineColor = prices[prices.length - 1][1] >= prices[0][1] ? t.green : t.red;
    return { points, min, max, lineColor };
  }, [prices, t]);

  const styles = makeStyles(t);

  if (error) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '详情' }} />
        <View style={[styles.center, styles.errorBody]}>
          <Text style={styles.dim}>加载失败</Text>
        </View>
      </View>
    );
  }

  if (!coin) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '详情' }} />
        <View style={[styles.center, styles.errorBody]}>
          <Text style={styles.dim}>加载中…</Text>
        </View>
      </View>
    );
  }

  const md = coin.market_data;
  const desc = coin.description?.en?.replace(/<[^>]+>/g, '') ?? '';

  const overviewStats = [
    { title: '当前价格', value: `$${md.current_price.usd.toLocaleString('en-US')}`, pct: md.price_change_percentage_24h },
    { title: '市值', value: `$${formatBig(md.market_cap.usd)}`, pct: md.market_cap_change_percentage_24h },
    { title: '排名', value: `#${coin.market_cap_rank ?? '-'}` },
    { title: '24h 成交量', value: `$${formatBig(md.total_volume.usd)}` },
  ];
  const additionalStats = [
    { title: '24h 最高', value: `$${md.high_24h.usd}` },
    { title: '24h 最低', value: `$${md.low_24h.usd}` },
    { title: '流通量', value: formatBig(md.circulating_supply) },
    { title: '总量', value: md.total_supply ? formatBig(md.total_supply) : '∞' },
  ];

  // 图表下方日期行：起始 7 天前、结束今天
  const fmtDate = (ts) => `${new Date(ts).getMonth() + 1}/${new Date(ts).getDate()}`;
  const startTs = prices.length ? prices[0][0] : Date.now();
  const endTs = prices.length ? prices[prices.length - 1][0] : Date.now();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 原生导航栏：标题随加载结果显示币名 */}
      <Stack.Screen options={{ title: coin.name }} />
      {/* 顶部：币名标题 + 右上角 符号+logo */}
      <View style={styles.header}>
        <Text style={styles.name}>{coin.name}</Text>
        <View style={styles.headerRight}>
          <Text style={styles.headerSymbol}>{coin.symbol.toUpperCase()}</Text>
          <Image source={{ uri: coin.image?.large }} style={styles.headerLogo} />
        </View>
      </View>

      {/* 7 天走势图：网格线 + 发光折线 + Y 轴标签 */}
      {chart ? (
        <View style={styles.chartWrap}>
          <Svg viewBox="0 0 300 200" preserveAspectRatio="none" style={[styles.chart, { width }]}>
            <Line x1="0" y1="1" x2="300" y2="1" stroke={t.divider} strokeWidth="1" />
            <Line x1="0" y1="100" x2="300" y2="100" stroke={t.divider} strokeWidth="1" />
            <Line x1="0" y1="199" x2="300" y2="199" stroke={t.divider} strokeWidth="1" />
            {/* 发光效果：几层半透明宽线叠在主线下 */}
            <Polyline points={chart.points} fill="none" stroke={chart.lineColor} strokeWidth={7} strokeOpacity={0.15} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points={chart.points} fill="none" stroke={chart.lineColor} strokeWidth={4.5} strokeOpacity={0.25} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points={chart.points} fill="none" stroke={chart.lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          {/* Y 轴三个标签：max / mid / min */}
          <View style={styles.yLabels} pointerEvents="none">
            <Text style={styles.yLabel}>{formatBig(chart.max)}</Text>
            <Text style={styles.yLabel}>{formatBig((chart.max + chart.min) / 2)}</Text>
            <Text style={styles.yLabel}>{formatBig(chart.min)}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.dim}>暂无走势数据</Text>
      )}
      {chart ? (
        <View style={styles.dateRow}>
          <Text style={styles.dateText}>{fmtDate(startTs)}</Text>
          <Text style={styles.dateText}>{fmtDate(endTs)}</Text>
        </View>
      ) : null}

      {/* 概览 */}
      <Text style={styles.sectionTitle}>概览</Text>
      <View style={styles.divider} />
      {desc ? (
        <>
          <Text style={styles.desc} numberOfLines={expanded ? undefined : 3}>
            {desc}
          </Text>
          <TouchableOpacity onPress={() => setExpanded(!expanded)}>
            <Text style={styles.readMore}>{expanded ? '收起' : '展开全文…'}</Text>
          </TouchableOpacity>
        </>
      ) : null}
      <View style={styles.grid}>
        {overviewStats.map((s) => (
          <StatCell key={s.title} stat={s} styles={styles} t={t} />
        ))}
      </View>

      {/* 更多数据 */}
      <Text style={[styles.sectionTitle, { marginTop: 30 }]}>更多数据</Text>
      <View style={styles.divider} />
      <View style={styles.grid}>
        {additionalStats.map((s) => (
          <StatCell key={s.title} stat={s} styles={styles} t={t} />
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/** 统计块：标题（灰小字）+ 数值（粗）+ 可选涨跌行（带三角） */
function StatCell({ stat, styles, t }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statTitle}>{stat.title}</Text>
      <Text style={styles.statValue}>{stat.value}</Text>
      {stat.pct !== undefined && stat.pct !== null ? (
        <View style={styles.statChangeRow}>
          <Text style={[styles.statTriangle, { color: stat.pct >= 0 ? t.green : t.red }]}>
            {stat.pct >= 0 ? '▲' : '▼'}
          </Text>
          <Text style={[styles.statPct, { color: stat.pct >= 0 ? t.green : t.red }]}>
            {formatPercent(stat.pct)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** 大数字缩写：1.23B / 345M / 6.7K */
function formatBig(value) {
  const num = Number(value);
  if (!isFinite(num)) return '-';
  if (Math.abs(num) >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}

const makeStyles = (t) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.background,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorHeader: {
      alignSelf: 'stretch',
    },
    errorBody: {
      flex: 1,
    },
    content: {
      padding: 16,
    },
    dim: {
      color: t.secondaryText,
      fontSize: 14,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    name: {
      fontSize: 22,
      fontWeight: 'bold',
      color: t.accent,
      flex: 1,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerSymbol: {
      fontSize: 15,
      fontWeight: '600',
      color: t.secondaryText,
      marginRight: 8,
    },
    headerLogo: {
      width: 25,
      height: 25,
      borderRadius: 12.5,
      backgroundColor: t.card,
    },
    chartWrap: {
      alignItems: 'center',
    },
    chart: {
      height: 200,
    },
    yLabels: {
      position: 'absolute',
      left: 4,
      top: 2,
      bottom: 2,
      justifyContent: 'space-between',
    },
    yLabel: {
      fontSize: 11,
      color: t.secondaryText,
      backgroundColor: 'transparent',
    },
    dateRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      marginTop: 6,
    },
    dateText: {
      fontSize: 12,
      color: t.secondaryText,
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: t.accent,
      marginTop: 25,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.divider,
      marginVertical: 12,
    },
    desc: {
      fontSize: 15,
      color: t.secondaryText,
      lineHeight: 22,
    },
    readMore: {
      fontSize: 12,
      fontWeight: 'bold',
      color: t.link,
      paddingVertical: 6,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: 30,
      marginTop: 15,
    },
    statCell: {
      width: '50%',
      alignItems: 'flex-start',
    },
    statTitle: {
      fontSize: 12,
      color: t.secondaryText,
    },
    statValue: {
      fontSize: 16,
      fontWeight: '700',
      color: t.accent,
      marginTop: 4,
    },
    statChangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    statTriangle: {
      fontSize: 10,
      marginRight: 4,
    },
    statPct: {
      fontSize: 12,
      fontWeight: 'bold',
    },
  });
