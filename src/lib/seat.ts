export const RESIDENT_DAY = 30;

/** A seat is time, not a task. Day 30 is the first honest mark. */
export function seatCopy(since: string | null, now = Date.now()): { days: number; title: string; line: string } {
  if (!since) {
    return { days: 0, title: "No seat yet", line: "A buy opens one. There is nothing to farm." };
  }
  const start = new Date(since).getTime();
  if (!Number.isFinite(start)) {
    return { days: 0, title: "No seat yet", line: "A buy opens one. There is nothing to farm." };
  }
  const days = Math.max(0, Math.floor((now - start) / 86_400_000));
  if (days >= RESIDENT_DAY) {
    return { days, title: "Resident", line: `Day ${days}. You stayed. Fees still accrue while you hold.` };
  }
  if (days === 0) {
    return { days, title: "New", line: "Opened today. It keeps counting as long as you stay." };
  }
  if (days < 7) {
    return { days, title: "New", line: `Day ${days}. The seat is the holding, not a checklist.` };
  }
  return { days, title: "Staying", line: `Day ${days} of ${RESIDENT_DAY}. Still here is the whole point.` };
}
