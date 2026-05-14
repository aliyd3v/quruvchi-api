function getWeekRange(date = new Date()) {
  const today = new Date(date);
  const dayIndex = today.getDay();

  const diffUntilMonday = dayIndex === 0 ? -6 : 1 - dayIndex;

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() + diffUntilMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return { startOfWeek, endOfWeek };
}

module.exports = getWeekRange;
