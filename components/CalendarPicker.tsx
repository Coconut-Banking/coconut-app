import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme-context";
import { font, radii } from "../lib/theme";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isInRange(day: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  return day > start && day < end;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  startDate: Date | null;
  endDate: Date | null;
  onSelect: (start: Date | null, end: Date | null) => void;
}

export function CalendarPicker({ startDate, endDate, onSelect }: Props) {
  const { theme } = useTheme();
  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [selectingEnd, setSelectingEnd] = useState(false);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const cells: (Date | null)[] = useMemo(() => {
    const arr: (Date | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(viewYear, viewMonth, d));
    return arr;
  }, [viewYear, viewMonth, daysInMonth, firstDayOfWeek]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const handleDayPress = (day: Date) => {
    if (!selectingEnd || !startDate) {
      onSelect(day, null);
      setSelectingEnd(true);
    } else {
      if (day < startDate) {
        onSelect(day, startDate);
      } else {
        onSelect(startDate, day);
      }
      setSelectingEnd(false);
    }
  };

  return (
    <View style={[s.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Month navigation */}
      <View style={s.header}>
        <TouchableOpacity onPress={prevMonth} hitSlop={12}>
          <Ionicons name="chevron-back" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.monthLabel, { color: theme.text }]}>
          {MONTHS[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={12}>
          <Ionicons name="chevron-forward" size={18} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Day headers */}
      <View style={s.row}>
        {DAYS.map((d) => (
          <View key={d} style={s.cell}>
            <Text style={[s.dayHeader, { color: theme.textTertiary }]}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      <View style={s.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e-${i}`} style={s.cell} />;

          const isStart = startDate ? isSameDay(day, startDate) : false;
          const isEnd = endDate ? isSameDay(day, endDate) : false;
          const inRange = isInRange(day, startDate, endDate);
          const isToday = isSameDay(day, today);
          const selected = isStart || isEnd;

          return (
            <TouchableOpacity
              key={toYMD(day)}
              style={[
                s.cell,
                inRange && { backgroundColor: theme.primaryLight || theme.accentMuted },
                isStart && { backgroundColor: theme.primary, borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
                isEnd && { backgroundColor: theme.primary, borderTopRightRadius: 20, borderBottomRightRadius: 20 },
              ]}
              onPress={() => handleDayPress(day)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  s.dayText,
                  { color: theme.text },
                  selected && { color: "#FFFFFF", fontWeight: "800" },
                  inRange && { color: theme.primary },
                  isToday && !selected && { color: theme.primary, fontWeight: "800" },
                ]}
              >
                {day.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selection hint */}
      <Text style={[s.hint, { color: theme.textTertiary }]}>
        {!startDate
          ? "Tap to select start date"
          : !endDate
            ? "Tap to select end date"
            : `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  monthLabel: {
    fontSize: 15,
    fontFamily: font.bold,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayHeader: {
    fontSize: 11,
    fontFamily: font.semibold,
    fontWeight: "600",
  },
  dayText: {
    fontSize: 14,
    fontFamily: font.medium,
    fontWeight: "500",
  },
  hint: {
    fontSize: 12,
    fontFamily: font.medium,
    textAlign: "center",
    marginTop: 10,
  },
});
