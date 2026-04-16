import AsyncStorage from "@react-native-async-storage/async-storage";

const HERO_KEY = "coconut_ttp_hero_modal_seen_v1";
const EDU_DONE_KEY = "coconut_ttp_education_completed_v1";

export async function hasSeenTapToPayHeroModal(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HERO_KEY)) === "1";
  } catch {
    return true;
  }
}

export async function markTapToPayHeroModalSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(HERO_KEY, "1");
  } catch {
    /* ignore */
  }
}

export async function hasCompletedTapToPayEducation(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(EDU_DONE_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markTapToPayEducationCompleted(): Promise<void> {
  try {
    await AsyncStorage.setItem(EDU_DONE_KEY, "1");
  } catch {
    /* ignore */
  }
}
