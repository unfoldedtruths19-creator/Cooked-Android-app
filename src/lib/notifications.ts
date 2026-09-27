import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { generateRoast, getInactivityRoast } from './roast';
import { WeeklyFocusDay } from './screenTimeData';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === 'granted';
}

async function cancelNotificationsByType(type: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.type === type) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

export async function scheduleDailyRoast(stats: any, weeklyFocus: WeeklyFocusDay[], enabled: boolean) {
  // Cancel previous daily roasts and reminders first to avoid duplicates
  await cancelNotificationsByType('roast');
  await cancelNotificationsByType('reminder');

  if (!enabled) return;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  // 1. Daily Roast (9 PM)
  const roastMessage = generateRoast(stats, weeklyFocus, new Date().getDate());
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'COOKED Daily Roast 🔥',
      body: roastMessage,
      data: { type: 'roast' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 21,
      minute: 0,
    },
  });

  // 2. Encouragement / Focus Reminder (10 AM)
  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
  const morningMessage = isWeekend 
    ? "Weekend doesn't mean weak end. Get one focus session in today."
    : "Time to lock in. Start a focus session and prove you're not an NPC.";
    
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Time to lock in 🎯',
      body: morningMessage,
      data: { type: 'reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 10,
      minute: 0,
    },
  });
}

export async function cancelInactivityRoasts() {
  await cancelNotificationsByType('inactivity');
}

const TEST_MODE = false;

export async function scheduleInactivityRoasts(enabled: boolean) {
  await cancelInactivityRoasts();

  if (!enabled) return;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const intervals = [24, 48, 72] as const;
  
  for (const hours of intervals) {
    const seed = Math.floor(Math.random() * 100);
    const message = getInactivityRoast(hours, seed);
    
    // In TEST_MODE: 24h -> 30s, 48h -> 60s, 72h -> 90s
    let secondsToTrigger = hours * 60 * 60;
    if (TEST_MODE) {
      if (hours === 24) secondsToTrigger = 30;
      if (hours === 48) secondsToTrigger = 60;
      if (hours === 72) secondsToTrigger = 90;
    }
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Where did you go? 💀',
        body: message,
        data: { type: 'inactivity' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsToTrigger,
      },
    });
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

export async function handleAppLaunch() {
  const lastActiveStr = await AsyncStorage.getItem('last_active_timestamp');
  const now = Date.now();
  
  if (lastActiveStr) {
    const lastActive = parseInt(lastActiveStr, 10);
    const hoursSince = (now - lastActive) / (1000 * 60 * 60);
    
    if (hoursSince >= 24) {
      // Alert user they are back
      Alert.alert('Look who finally came back 💀', 'Time to lock in.');
    }
  }

  // Update last active
  await AsyncStorage.setItem('last_active_timestamp', now.toString());

  // Reschedule inactivity roasts
  const enabledStr = await AsyncStorage.getItem('prefs_daily_roast');
  const enabled = enabledStr !== 'false';
  await scheduleInactivityRoasts(enabled);
}
