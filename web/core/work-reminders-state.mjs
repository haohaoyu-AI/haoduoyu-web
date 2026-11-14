// Keep paused project reminders in storage/API history; hide only their cards.
export function visibleWorkReminders(items = []) {
  return items.filter(row => row.source_key !== 'tencent.daily-summary');
}
