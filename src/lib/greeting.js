export function greetingKey(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'goodMorning';
  if (hour >= 12 && hour < 17) return 'goodAfternoon';
  if (hour >= 17 && hour < 21) return 'goodEvening';
  return 'goodNight';
}
