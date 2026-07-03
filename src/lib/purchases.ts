import { Platform } from "react-native";
import { initConnection, endConnection, fetchProducts, requestPurchase, finishTransaction } from "react-native-iap";
import { supabase } from "./supabase";
import { IAP_SKUS } from "../constants/iap";

let initialized = false;

export async function initIAP(): Promise<void> {
  if (initialized) return;
  await initConnection();
  initialized = true;
}

export async function endIAP(): Promise<void> {
  if (!initialized) return;
  await endConnection();
  initialized = false;
}

export async function getAvailableProducts() {
  await initIAP();
  return fetchProducts({ skus: IAP_SKUS });
}

/**
 * Achète un pack de Tessels (consommable) et retourne le nouveau solde.
 */
export async function purchaseTesselPack(sku: string): Promise<number> {
  await initIAP();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purchase = await (requestPurchase as any)({
    request: { sku },
    type: "in-app",
  });

  if (!purchase) throw new Error("Purchase canceled");

  const receipt =
    Platform.OS === "ios" ? purchase.transactionReceipt : purchase.purchaseToken;
  if (!receipt) throw new Error("No receipt received");

  const { data, error } = await supabase.functions.invoke("validate-receipt", {
    body: {
      receipt,
      platform: Platform.OS,
      transaction_id: purchase.transactionId,
      sku,
    },
  });

  if (error) throw error;
  if (!data?.success) throw new Error(data?.error ?? "Validation failed");

  await finishTransaction({ purchase, isConsumable: true });

  return data.balance as number;
}
