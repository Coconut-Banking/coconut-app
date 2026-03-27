import React, { createContext, useContext, useState, useCallback } from "react";
import type {
  GroupsSummary,
  GroupDetail,
  PersonDetail,
  RecentActivityItem,
  FriendBalance,
  GroupSummary,
} from "../hooks/useGroups";
import {
  DEMO_SUMMARY,
  DEMO_GROUP_DETAILS,
  DEMO_PERSON_DETAILS,
  DEMO_ACTIVITY,
} from "./demo-data";
import { useDemoMode } from "./demo-mode-context";

interface DemoState {
  summary: GroupsSummary | null;
  groupDetails: Record<string, GroupDetail>;
  personDetails: Record<string, PersonDetail>;
  activity: RecentActivityItem[];
  addExpense: (amount: number, description: string, targetKey: string, targetType: "friend" | "group") => void;
  settlePerson: (key: string) => void;
  settleGroupSuggestion: (groupId: string, fromId: string, toId: string) => void;
}

const DemoContext = createContext<DemoState | null>(null);

const noop = () => {};

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const { isDemoOn } = useDemoMode();
  const [summary, setSummary] = useState<GroupsSummary>({ ...DEMO_SUMMARY });
  const [groupDetails, setGroupDetails] = useState<Record<string, GroupDetail>>({ ...DEMO_GROUP_DETAILS });
  const [personDetails, setPersonDetails] = useState<Record<string, PersonDetail>>({ ...DEMO_PERSON_DETAILS });
  const [activity, setActivity] = useState<RecentActivityItem[]>([...DEMO_ACTIVITY]);

  const recalcSummary = useCallback((friends: FriendBalance[]) => {
    const totalsMap = new Map<string, { owedToMe: number; iOwe: number }>();
    for (const f of friends) {
      const lines =
        f.balances && f.balances.length > 0
          ? f.balances
          : f.balance != null && Math.abs(f.balance) >= 0.005
            ? [{ currency: "USD", amount: f.balance }]
            : [];
      for (const b of lines) {
        const t = totalsMap.get(b.currency) ?? { owedToMe: 0, iOwe: 0 };
        if (b.amount > 0.005) t.owedToMe += b.amount;
        else if (b.amount < -0.005) t.iOwe += Math.abs(b.amount);
        totalsMap.set(b.currency, t);
      }
    }
    const totalsByCurrency = [...totalsMap.entries()]
      .map(([currency, v]) => ({
        currency,
        owedToMe: Math.round(v.owedToMe * 100) / 100,
        iOwe: Math.round(v.iOwe * 100) / 100,
        net: Math.round((v.owedToMe - v.iOwe) * 100) / 100,
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

    let totalOwedToMe: number | null;
    let totalIOwe: number | null;
    let netBalance: number | null;
    if (totalsByCurrency.length === 0) {
      totalOwedToMe = 0;
      totalIOwe = 0;
      netBalance = 0;
    } else if (totalsByCurrency.length === 1) {
      totalOwedToMe = totalsByCurrency[0].owedToMe;
      totalIOwe = totalsByCurrency[0].iOwe;
      netBalance = totalsByCurrency[0].net;
    } else {
      totalOwedToMe = null;
      totalIOwe = null;
      netBalance = null;
    }
    return { totalOwedToMe, totalIOwe, netBalance, totalsByCurrency };
  }, []);

  const addExpense = useCallback((amount: number, description: string, targetKey: string, targetType: "friend" | "group") => {
    const id = `exp-${Date.now()}`;
    const splitAmount = amount / 2;

    if (targetType === "friend") {
      setPersonDetails(prev => {
        const person = prev[targetKey];
        if (!person) return prev;
        const newActivity = [{
          id,
          merchant: description,
          amount,
          currency: "USD",
          groupName: "Direct",
          paidByMe: true,
          paidByThem: false,
          myShare: splitAmount,
          theirShare: splitAmount,
          effectOnBalance: splitAmount,
          createdAt: new Date().toISOString(),
        }, ...person.activity];
        const nextBal = (person.balance ?? 0) + splitAmount;
        const nextLines = [{ currency: "USD", amount: nextBal }];
        return {
          ...prev,
          [targetKey]: {
            ...person,
            balance: nextBal,
            currencyBalances: nextLines,
            activity: newActivity,
          },
        };
      });

      setSummary(prev => {
        const friends = prev.friends.map((f) =>
          f.key === targetKey
            ? { ...f, balance: (f.balance ?? 0) + splitAmount, balances: [{ currency: "USD", amount: (f.balance ?? 0) + splitAmount }] }
            : f
        );
        const totals = recalcSummary(friends);
        return { ...prev, friends, ...totals };
      });
    } else {
      setGroupDetails(prev => {
        const group = prev[targetKey];
        if (!group) return prev;
        const newAct = [{
          id,
          merchant: description,
          amount,
          currency: "USD",
          paidBy: "m1",
          splitCount: group.members.length,
          createdAt: new Date().toISOString(),
        }, ...group.activity];
        const prevSpend = group.totalSpend ?? 0;
        const nextSpend = prevSpend + amount;
        return {
          ...prev,
          [targetKey]: {
            ...group,
            activity: newAct,
            totalSpend: nextSpend,
            totalSpendByCurrency: [{ currency: "USD", amount: nextSpend }],
          },
        };
      });

      setSummary(prev => {
        const groups = prev.groups.map(g =>
          g.id === targetKey ? { ...g, lastActivityAt: new Date().toISOString() } : g
        );
        return { ...prev, groups };
      });
    }

    setActivity(prev => [{
      id: `ra-${Date.now()}`,
      who: "You",
      action: "added",
      what: description,
      in: targetType === "group" ? (groupDetails[targetKey]?.name ?? "") : "",
      direction: "get_back" as const,
      amount: splitAmount,
      time: "Just now",
    }, ...prev]);
  }, [groupDetails, recalcSummary]);

  const settlePerson = useCallback((key: string) => {
    setPersonDetails(prev => {
      const person = prev[key];
      if (!person) return prev;
      return { ...prev, [key]: { ...person, balance: 0, currencyBalances: [], settlements: [] } };
    });

    setSummary(prev => {
      const friends = prev.friends.map((f) => (f.key === key ? { ...f, balance: 0, balances: [] } : f));
      const totals = recalcSummary(friends);
      return { ...prev, friends, ...totals };
    });

    setActivity(prev => [{
      id: `ra-${Date.now()}`,
      who: "You",
      action: "settled",
      what: "",
      in: "",
      direction: "settled" as const,
      amount: 0,
      time: "Just now",
    }, ...prev]);
  }, [recalcSummary]);

  const settleGroupSuggestion = useCallback((groupId: string, fromId: string, toId: string) => {
    setGroupDetails(prev => {
      const group = prev[groupId];
      if (!group) return prev;
      const suggestions = group.suggestions.filter(
        s => !(s.fromMemberId === fromId && s.toMemberId === toId)
      );
      return { ...prev, [groupId]: { ...group, suggestions } };
    });
  }, []);

  const value: DemoState = isDemoOn
    ? { summary, groupDetails, personDetails, activity, addExpense, settlePerson, settleGroupSuggestion }
    : {
        summary: null,
        groupDetails: {},
        personDetails: {},
        activity: [],
        addExpense: noop,
        settlePerson: noop,
        settleGroupSuggestion: noop,
      };

  return (
    <DemoContext.Provider value={value}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemoData() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemoData must be inside DemoProvider");
  return ctx;
}
