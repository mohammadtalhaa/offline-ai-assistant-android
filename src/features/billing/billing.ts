import { ENFORCE_PRO, OFFLINE_GRACE_DAYS } from '../../config';
import { secureGet, secureSet, secureDelete } from '../../services/storage/secure';

export type Plan = 'monthly' | 'lifetime';

export interface Entitlement {
  pro: boolean;
  plan: Plan | null;
  /** Epoch ms when the current period ends (null for lifetime / free). */
  expiresAt: number | null;
  verifiedAt: number | null;
}

export const FREE_ENTITLEMENT: Entitlement = { pro: false, plan: null, expiresAt: null, verifiedAt: null };
const KEY = 'entitlement.v1';

/**
 * Whether Pro features are available right now. While ENFORCE_PRO is false everything is unlocked.
 * Cached subscriptions stay valid for OFFLINE_GRACE_DAYS after expiry so a phone that is offline
 * for a while does not lose features it paid for.
 */
export function isProActive(e: Entitlement, now = Date.now()): boolean {
  if (!ENFORCE_PRO) return true;
  if (!e.pro) return false;
  if (e.plan === 'lifetime') return true;
  if (!e.expiresAt) return false;
  return now < e.expiresAt + OFFLINE_GRACE_DAYS * 86_400_000;
}

export async function loadEntitlement(): Promise<Entitlement> {
  return (await secureGet<Entitlement>(KEY)) ?? FREE_ENTITLEMENT;
}

export async function saveEntitlement(e: Entitlement): Promise<void> {
  await secureSet(KEY, e);
}

export async function clearEntitlement(): Promise<void> {
  await secureDelete(KEY);
}

export interface BillingProvider {
  purchase(plan: Plan): Promise<Entitlement>;
  restore(): Promise<Entitlement | null>;
}

/**
 * Development-only provider: grants Pro locally so you can test gated UI.
 * It performs NO real payment and NO server verification. Never ship it enabled.
 */
const DevProvider: BillingProvider = {
  async purchase(plan) {
    const now = Date.now();
    return { pro: true, plan, expiresAt: plan === 'lifetime' ? null : now + 30 * 86_400_000, verifiedAt: now };
  },
  async restore() {
    return null;
  },
};

/**
 * Production wiring point. Implement a Google Play Billing provider here
 * (e.g. with react-native-iap), verify purchases server-side or with the Play
 * Developer API, then return it. See README → "Subscriptions".
 */
export function getBillingProvider(): BillingProvider | null {
  return __DEV__ ? DevProvider : null;
}
