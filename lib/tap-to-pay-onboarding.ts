import AsyncStorage from "@react-native-async-storage/async-storage";

const HERO_KEY = "coconut_ttp_hero_modal_seen_v1";
const EDU_DONE_KEY = "coconut_ttp_education_completed_v1";
/** Set once the user has scrolled + accepted Apple's Tap to Pay T&Cs */
const TERMS_KEY = "coconut_ttp_terms_accepted_v1";

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

export async function hasAcceptedTapToPayTerms(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(TERMS_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markTapToPayTermsAccepted(): Promise<void> {
  try {
    await AsyncStorage.setItem(TERMS_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Clears all TTP onboarding flags — used for video recording / demo resets. */
export async function resetAllTapToPayFlags(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([HERO_KEY, EDU_DONE_KEY, TERMS_KEY]);
  } catch {
    /* ignore */
  }
}
