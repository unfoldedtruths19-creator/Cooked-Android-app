import { WeeklyFocusDay } from './screenTimeData';
import { formatMinutes } from '@/data/mock';

export function generateRoast(stats: any, weeklyFocus: WeeklyFocusDay[], seed: number): string {
  const { focusMinutes, screenTimeMinutes, distractions, abandonedCount, completedCount } = stats;
  
  const roasts: string[] = [];

  // Abandoned sessions roast
  if (abandonedCount > 2) {
    roasts.push(`Bro has abandoned more sessions (${abandonedCount}) than a bot abandons its own code 💀`);
  }

  // Screen time vs focus roast
  if (screenTimeMinutes > 180 && focusMinutes < 30) {
    roasts.push(`Your screen time is working overtime (${formatMinutes(screenTimeMinutes)}). Your goals are still unemployed 🤡`);
  }

  // Missed weekly goals roast
  const missedDays = weeklyFocus.filter(d => d.status === 'missed').length;
  if (missedDays > 2) {
    roasts.push(`Bro makes plans like a CEO and executes like a broken NPC. ${missedDays} days missed this week 💀`);
  }

  // Short focus roast
  if (focusMinutes > 0 && focusMinutes < 15 && completedCount > 0) {
    roasts.push(`Your focus session was shorter than a loading screen 😭`);
  }

  // Good focus roast
  if (focusMinutes >= 60) {
    roasts.push(`Okay, bro actually locked in for ${formatMinutes(focusMinutes)}. The NPC has evolved 🔥`);
  }

  // Distractions roast
  if (distractions > 5) {
    roasts.push(`You tried to open blocked apps ${distractions} times today. Your attention span is completely cooked 🍳`);
  }

  if (roasts.length === 0) {
    if (focusMinutes === 0) roasts.push(`Stop scrolling and do something useful with your life.`);
    else roasts.push(`Not bad for a noob. Keep it up.`);
  }

  return roasts[seed % roasts.length];
}

const INACTIVITY_ROASTS_24H = [
  "Bro really downloaded COOKED just to disappear 💀",
  "Noob leaves COOKED first. Come back and lock in.",
  "Your goals are waiting. Your excuses aren't.",
  "Bro went AFK in real life 💀"
];

const INACTIVITY_ROASTS_48H = [
  "Two days gone. Bro thinks discipline is optional 💀",
  "COOKED misses its favorite quitter.",
  "Your streak isn't going to save itself, bro."
];

const INACTIVITY_ROASTS_72H = [
  "Bro really abandoned the comeback arc 💀",
  "Still missing? Your goals are collecting dust.",
  "The grind called. You didn't answer."
];

export function getInactivityRoast(hours: 24 | 48 | 72, seed: number): string {
  let roasts = INACTIVITY_ROASTS_24H;
  if (hours === 48) roasts = INACTIVITY_ROASTS_48H;
  if (hours === 72) roasts = INACTIVITY_ROASTS_72H;

  return roasts[seed % roasts.length];
}
