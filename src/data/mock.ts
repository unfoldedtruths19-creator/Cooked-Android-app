/** Stand-in data until the tracking layer lands. Shapes match what the UI needs. */

export const today = {
  cookedScore: 72,
  screenTimeMinutes: 222,
  focusMinutes: 138,
  pickups: 91,
  distractions: 47,
  streakDays: 4,
  changeVsYesterday: -24,
};

export const worstApp = { name: 'Instagram', opens: 47, minutes: 132 };

export const topApps = [
  { name: 'Instagram', minutes: 132, opens: 47 },
  { name: 'YouTube', minutes: 54, opens: 12 },
  { name: 'WhatsApp', minutes: 21, opens: 63 },
  { name: 'Reddit', minutes: 15, opens: 9 },
];

export const week = [
  { day: 'Mon', attention: 61, screenMinutes: 268 },
  { day: 'Tue', attention: 54, screenMinutes: 301 },
  { day: 'Wed', attention: 72, screenMinutes: 244 },
  { day: 'Thu', attention: 83, screenMinutes: 190 },
  { day: 'Fri', attention: 66, screenMinutes: 255 },
  { day: 'Sat', attention: 91, screenMinutes: 148 },
  { day: 'Sun', attention: 78, screenMinutes: 222 },
];

export const attentionScore = 78;

export const blockedApps = ['Instagram', 'YouTube', 'TikTok', 'Reddit'];

export const circle = {
  name: 'MIDNIGHT GRINDERS',
  focusing: 12,
  size: 12,
  members: [
    { name: 'You', minutes: 47, focusing: true },
    { name: 'Arjun', minutes: 52, focusing: true },
    { name: 'Rahul', minutes: 41, focusing: true },
    { name: 'Meera', minutes: 38, focusing: true },
    { name: 'Dev', minutes: 33, focusing: true },
    { name: 'Sana', minutes: 29, focusing: true },
  ],
};

/** Roasts are written to sting for a second, then make you laugh. Never cruel. */
export const roasts = [
  {
    hook: 'BRO.',
    body: `You opened ${worstApp.name} ${worstApp.opens} times today. That's basically a part-time job.`,
    kicker: 'Do better tomorrow.',
  },
  {
    hook: 'RESPECTFULLY,',
    body: `${Math.round(today.screenTimeMinutes / 60)} hours of screen time and ${today.pickups} pickups. Your thumb did more reps than you did.`,
    kicker: 'Tomorrow: one focus block before noon.',
  },
  {
    hook: 'BE HONEST.',
    body: `You resisted ${today.distractions} distractions and still fed the algorithm ${worstApp.minutes} minutes.`,
    kicker: 'It is winning on volume, not skill.',
  },
  {
    hook: 'GOOD NEWS.',
    body: `Screen time is down ${Math.abs(today.changeVsYesterday)}% and your streak hit ${today.streakDays} days.`,
    kicker: 'Do not celebrate on Instagram.',
  },
];

export function formatMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
