import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Eyebrow, GhostButton, Meter, Screen } from '@/components/app/ui';
import { circle } from '@/data/mock';
import { blur, colors, font, radius, space } from '@/theme/tokens';

export function CirclesScreen() {
  const router = useRouter();
  const leader = Math.max(...circle.members.map((member) => member.minutes));

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          <Eyebrow>Focus circle</Eyebrow>
          <Text style={styles.name}>{circle.name}</Text>
          <View style={styles.liveRow}>
            <View style={styles.dot} />
            <Text style={styles.live}>
              {circle.focusing}/{circle.size} focusing
            </Text>
          </View>
        </View>

        <Meter percent={(circle.focusing / circle.size) * 100} />

        <View style={styles.members}>
          <BlurView intensity={blur.tile} tint="dark" style={StyleSheet.absoluteFill} />
          {circle.members.map((member) => (
            <View key={member.name} style={styles.member}>
              <View style={styles.memberHead}>
                <View style={styles.memberName}>
                  <View style={[styles.dot, !member.focusing && styles.dotIdle]} />
                  <Text style={[styles.who, member.name === 'You' && styles.you]}>
                    {member.name}
                  </Text>
                </View>
                <Text style={styles.minutes}>{member.minutes} min</Text>
              </View>
              <Meter
                percent={(member.minutes / leader) * 100}
                tone={member.name === 'You' ? 'brand' : 'dim'}
              />
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          No feed, no likes. The circle only knows whether you are focusing.
        </Text>

        <GhostButton label="Leave circle" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {},
  scroll: {
    gap: space.md,
    paddingBottom: space.xl,
  },
  head: {
    gap: space.xs,
  },
  name: {
    color: colors.text,
    fontFamily: font.displayHeavy,
    fontSize: 30,
    letterSpacing: 1.5,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.mint,
  },
  dotIdle: {
    backgroundColor: colors.muted,
  },
  live: {
    color: colors.mint,
    fontFamily: font.bodySemi,
    fontSize: 13,
    letterSpacing: 0.6,
  },
  members: {
    gap: space.md,
    backgroundColor: colors.glass,
    borderRadius: radius.card - 6,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.glassLine,
    overflow: 'hidden',
    padding: space.md,
  },
  member: {
    gap: 7,
  },
  memberHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  who: {
    color: colors.textDim,
    fontFamily: font.bodySemi,
    fontSize: 14,
  },
  you: {
    color: colors.text,
  },
  minutes: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  note: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 18,
  },
});
