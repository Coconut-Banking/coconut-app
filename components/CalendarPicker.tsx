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

function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Props {
  startDate: Date | null;
  endDate: Date | null;
  onSelect: (start: Date | null, end: Date | null) => void;
  onApply?: () => void;
}

export function CalendarPicker({ startDate, endDate, onSelect, onApply }: Props) {
  const { theme, isDark } = useTheme();
  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(
    startDate ? startDate.getMonth() : today.getMonth()
  );
  const [viewYear, setViewYear] = useState(
    startDate ? startDate.getFullYear() : today.getFullYear()
  );
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

  const rangeBg = isDark ? "rgba(96, 165, 250, 0.12)" : theme.primaryLight || "rgba(31, 35, 40, 0.08)";
  const rangeText = isDark ? theme.accent : theme.primary;
  const selectedBg = isDark ? theme.accent : theme.primary;
  const hasRange = !!startDate && !!endDate;

  return (
    <View style={[s.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Month nav */}
      <View style={s.header}>
        <TouchableOpacity onPress={prevMonth} hitSlop={14} style={[s.navBtn, { backgroundColor: theme.surfaceSecondary }]}>
          <Ionicons name="chevron-back" size={16} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.monthLabel, { color: theme.text }]}>
          {MONTHS[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={14} style={[s.navBtn, { backgroundColor: theme.surfaceSecondary }]}>
          <Ionicons name="chevron-forward" size={16} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={s.row}>
        {DAYS.map((d) => (
          <View key={d} style={s.cell}>
            <Text style={[s.dayHeader, { color: theme.textQuaternary }]}>{d}</Text>
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
                inRange && { backgroundColor: rangeBg },
                isStart && hasRange && { borderTopLeftRadius: 18, borderBottomLeftRadius: 18 },
                isEnd && hasRange && { borderTopRightRadius: 18, borderBottomRightRadius: 18 },
              ]}
              onPress={() => handleDayPress(day)}
              activeOpacity={0.6}
            >
              <View style={[
                s.dayCircle,
                selected && { backgroundColor: selectedBg },
                isToday && !selected && { borderWidth: 1.5, borderColor: rangeText },
              ]}>
                <Text
                  style={[
                    s.dayText,
                    { color: theme.text },
                    selected && { color: "#fff" },
                    inRange && { color: rangeText },
                  ]}
                >
                  {day.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Footer: selection summary + apply */}
      <View style={[s.footer, { borderTopColor: theme.borderLight }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.hint, { color: theme.textTertiary }]}>
            {!startDate
              ? "Select start date"
              : !endDate
                ? "Select end date"
                : `${fmtShort(startDate)} — ${fmtShort(endDate)}`}
          </Text>
        </View>
        {onApply ? (
          <TouchableOpacity
            style={[s.applyBtn, { backgroundColor: selectedBg }, !hasRange && { opacity: 0.4 }]}
            onPress={hasRange ? onApply : undefined}
            disabled={!hasRange}
            activeOpacity={0.8}
          >
            <Text style={s.applyText}>Apply</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const CELL_H = 36;

const s = StyleSheet.create({
  container: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
  },
  navBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    fontSize: 15,
    fontFamily: font.semibold,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  cell: {
    width: "14.28%",
    height: CELL_H,
    alignItems: "center",
    justifyContent: "center",
  },
  dayHeader: {
    fontSize: 11,
    fontFamily: font.semibold,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: {
    fontSize: 14,
    fontFamily: font.medium,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hint: {
    fontSize: 13,
    fontFamily: font.medium,
  },
  applyBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  applyText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: font.semibold,
  },
});
