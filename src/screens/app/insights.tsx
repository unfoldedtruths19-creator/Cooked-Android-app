import { useEffect } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, Eyebrow, Meter, Screen, StatTile } from '@/components/app/ui';
import { formatMinutes } from '@/data/mock';
import { colors, font, radius, space } from '@/theme/tokens';
import { useScreenTimeStore } from '@/state/useScreenTimeStore';

export function InsightsScreen() {
  const { loadState, todayStats, weekEntries, appBreakdown, refresh } = useScreenTimeStore();

  useEffect(() => {
    useScreenTimeStore.getState().load();
  }, []);

  const isLoading = loadState === 'loading' || loadState === 'idle';
  const attentionScore = todayStats ? Math.max(0, 100 - todayStats.cookedScore) : 0;

  const best  = weekEntries.length ? weekEntries.reduce((a, b) => b.attention > a.attention ? b : a) : null;
  const worst = weekEntries.length ? weekEntries.reduce((a, b) => b.attention < a.attention ? b : a) : null;
  const peak  = weekEntries.length ? Math.max(...weekEntries.map((e) => e.screenMinutes), 1) : 1;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loadState === 'loading'}
            onRefresh={() => refresh()}
            tintColor={colors.mint}
          />
        }
      >
        <Eyebrow>Insights</Eyebrow>

        {/* ── Attention score ─────────────────────────────────────────────── */}
        <View style={styles.attention}>
          <View style={styles.attentionHead}>
            <Text style={styles.attentionLabel}>7 DAY ATTENTION</Text>
            {isLoading
              ? <ActivityIndicator color={colors.mint} />
              : <Text style={styles.attentionScore}>{attentionScore}</Text>}
          </View>
          <Meter percent={attentionScore} />
        </View>

        {/* ── Weekly bar chart ────────────────────────────────────────────── */}
        <Card>
          <View style={styles.chartHead}>
            <Text style={styles.cardTitle}>Screen time this week</Text>
            <Text style={styles.cardMeta}>
              {isLoading ? '—' : formatMinutes(todayStats?.screenTimeMinutes ?? 0)} today
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.chartLoader}>
              <ActivityIndicator color={colors.mint} />
            </View>
          ) : weekEntries.length === 0 ? (
            <Text style={styles.empty}>No data yet — sync your screen time to see the chart.</Text>
          ) : (
            <View style={styles.chart}>
              {weekEntries.map((entry, index) => {
                const isToday = index === weekEntries.length - 1;
                return (
                  <View key={`${entry.day}-${index}`} style={styles.column}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          { height: `${(entry.screenMinutes / peak) * 100}%` },
                          isToday && styles.barToday,
                        ]}
                      />
                    </View>
                    <Text style={[styles.day, isToday && styles.dayToday]}>{entry.day}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* ── Stat tiles ─────────────────────────────────────────────────── */}
        <View style={styles.tiles}>
          <StatTile
            value={isLoading ? '—' : String(todayStats?.pickups ?? 0)}
            label="Pickups today"
          />
          <StatTile value={isLoading ? '—' : String(todayStats?.distractions ?? 0)} label="Blocked" accent />
          <StatTile
            value={isLoading ? '—' : formatMinutes(todayStats?.focusMinutes ?? 0)}
            label="Focused"
          />
        </View>

        {/* ── App breakdown ──────────────────────────────────────────────── */}
        <Card>
          <Text style={styles.cardTitle}>Most distracting</Text>
          {isLoading ? (
            <ActivityIndicator color={colors.mint} style={styles.cardLoader} />
          ) : appBreakdown.length === 0 ? (
            <Text style={styles.empty}>No app data yet for today.</Text>
          ) : (
            <View style={styles.apps}>
              {appBreakdown.map((app, i) => (
                <View key={app.name} style={styles.appRow}>
                  <View style={styles.appHead}>
                    <Text style={styles.appName}>{app.name}</Text>
                    <Text style={styles.appMeta}>
                      {formatMinutes(app.minutes)} · {app.opens} opens
                    </Text>
                  </View>
                  <Meter
                    percent={(app.minutes / (appBreakdown[0]?.minutes || 1)) * 100}
                    tone={i === 0 ? 'brand' : 'dim'}
                  />
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* ── Best / worst day ───────────────────────────────────────────── */}
        {!isLoading && best && worst && (
          <View style={styles.extremes}>
            <View style={[styles.extreme, styles.extremeGood]}>
              <Text style={styles.extremeLabel}>BEST DAY</Text>
              <Text style={styles.extremeValue}>{best.day}</Text>
              <Text style={styles.extremeMeta}>{best.attention} attention</Text>
            </View>
            <View style={[styles.extreme, styles.extremeBad]}>
              <Text style={styles.extremeLabel}>WORST DAY</Text>
              <Text style={styles.extremeValue}>{worst.day}</Text>
              <Text style={styles.extremeMeta}>{worst.attention} attention</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll:         { gap: space.md, paddingBottom: space.xl },
  attention:      { gap: space.sm, paddingVertical: space.sm },
  attentionHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  attentionLabel: { color: colors.textDim, fontFamily: font.bodyMedium, fontSize: 12, letterSpacing: 2 },
  attentionScore: { color: colors.text, fontFamily: font.displayHeavy, fontSize: 40, lineHeight: 44, letterSpacing: -1.5 },
  cardTitle:      { color: colors.text, fontFamily: font.display, fontSize: 15 },
  cardMeta:       { color: colors.muted, fontFamily: font.body, fontSize: 12.5 },
  chartHead:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  chartLoader:    { height: 132, alignItems: 'center', justifyContent: 'center' },
  cardLoader:     { marginTop: space.md },
  chart:          { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, height: 132 },
  column:         { flex: 1, gap: 8, alignItems: 'center' },
  barTrack:       { width: '100%', height: 104, justifyContent: 'flex-end' },
  bar:            { width: '100%', borderRadius: 6, backgroundColor: 'rgba(173, 226, 210, 0.16)' },
  barToday:       { backgroundColor: colors.mint },
  day:            { color: colors.muted, fontFamily: font.body, fontSize: 11 },
  dayToday:       { color: colors.text, fontFamily: font.bodySemi },
  tiles:          { flexDirection: 'row', gap: space.sm },
  apps:           { gap: space.md, marginTop: space.md },
  appRow:         { gap: 7 },
  appHead:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  appName:        { color: colors.text, fontFamily: font.bodySemi, fontSize: 14 },
  appMeta:        { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  empty:          { color: colors.muted, fontFamily: font.body, fontSize: 13,
                    textAlign: 'center', paddingVertical: space.lg },
  extremes:       { flexDirection: 'row', gap: space.sm },
  extreme:        { flex: 1, borderRadius: radius.field, borderCurve: 'continuous',
                    borderWidth: 1, padding: space.md, gap: 3 },
  extremeGood:    { borderColor: 'rgba(143, 227, 117, 0.28)', backgroundColor: 'rgba(143, 227, 117, 0.06)' },
  extremeBad:     { borderColor: 'rgba(240, 132, 108, 0.25)', backgroundColor: 'rgba(240, 132, 108, 0.05)' },
  extremeLabel:   { color: colors.muted, fontFamily: font.bodyMedium, fontSize: 10.5, letterSpacing: 1.6 },
  extremeValue:   { color: colors.text, fontFamily: font.displayHeavy, fontSize: 22 },
  extremeMeta:    { color: colors.textDim, fontFamily: font.body, fontSize: 12 },
});
