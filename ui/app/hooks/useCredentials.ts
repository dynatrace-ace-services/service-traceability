/**
 * useCredentials — Credential Vault management hook.
 *
 * Ported and simplified from IAM Sankey's credential vault pattern.
 * Key differences from IAM Sankey:
 *   - No accountId field (scanner is environment-scoped, not account-scoped)
 *   - Vault state stored under VAULT_CONFIG_KEY as { vaultId } only
 *   - Vault name: VAULT_NAME_PREFIX + userEmail
 */

import { useCallback, useEffect, useState } from "react";
import {
  credentialVaultClient,
  type UserPasswordCredentials,
} from "@dynatrace-sdk/client-classic-environment-v2";
import { useUserAppState, useSetUserAppState } from "@dynatrace-sdk/react-hooks";
import { getCurrentUserDetails } from "@dynatrace-sdk/app-environment";
import { VAULT_CONFIG_KEY, VAULT_NAME_PREFIX, type VaultConfig } from "../types/scanner";

export type CredentialSaveStatus = "idle" | "saving" | "saved" | "error";
export type VaultDiscoveryStatus = "idle" | "searching" | "done" | "error";

export interface DiscoveredVault {
  id: string;
  name: string;
}

export interface UseCredentialsReturn {
  /** Whether a valid vault ID is stored and ready for workflow use. */
  isConfigured: boolean;
  /** The stored vault ID (opaque, never the secret itself). */
  vaultId: string;
  saveStatus: CredentialSaveStatus;
  saveError: string;
  discoveryStatus: VaultDiscoveryStatus;
  existingVaults: DiscoveredVault[];
  /** Create or update the vault entry with the provided OAuth2 credentials. */
  save: (clientId: string, clientSecret: string) => Promise<void>;
  /** Link an already-existing vault by ID without re-entering the secret. */
  linkExisting: (vaultId: string) => void;
  /** Refresh the list of existing vaults (called when settings panel opens). */
  discoverVaults: () => void;
  /** Clear any transient status messages. */
  resetStatus: () => void;
}

export function useCredentials(): UseCredentialsReturn {
  const userEmail = (() => {
    try {
      return getCurrentUserDetails().email ?? "";
    } catch {
      return "";
    }
  })();

  const vaultCredName = VAULT_NAME_PREFIX + userEmail;

  const { data: storedVaultConfig } = useUserAppState({ key: VAULT_CONFIG_KEY });
  const { execute: saveVaultState } = useSetUserAppState();

  const [vaultId, setVaultId] = useState("");
  const [saveStatus, setSaveStatus] = useState<CredentialSaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [discoveryStatus, setDiscoveryStatus] = useState<VaultDiscoveryStatus>("idle");
  const [existingVaults, setExistingVaults] = useState<DiscoveredVault[]>([]);

  // Restore vaultId from persisted user app state on mount
  useEffect(() => {
    const raw = (storedVaultConfig as { value?: string } | null)?.value;
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<VaultConfig>;
      if (parsed.vaultId) setVaultId(parsed.vaultId);
    } catch {
      /* ignore malformed state */
    }
  }, [storedVaultConfig]);

  const persistVaultId = useCallback(
    (id: string) => {
      void saveVaultState({
        key: VAULT_CONFIG_KEY,
        body: { value: JSON.stringify({ vaultId: id }) },
      });
    },
    [saveVaultState],
  );

  const save = useCallback(
    async (clientId: string, clientSecret: string): Promise<void> => {
      if (!clientId.trim() || !clientSecret.trim()) {
        setSaveError("Client ID and Client Secret are required.");
        setSaveStatus("error");
        return;
      }
      setSaveStatus("saving");
      setSaveError("");

      try {
        const body: UserPasswordCredentials = {
          name: vaultCredName,
          type: "USERNAME_PASSWORD",
          scopes: ["APP_ENGINE"],
          allowContextlessRequests: true,
          ownerAccessOnly: true,
          user: clientId.trim(),
          password: clientSecret.trim(),
        };

        const list = await credentialVaultClient.listCredentials({ name: vaultCredName });
        const existing = (list.credentials ?? []).find((cr) => cr.name === vaultCredName);

        let newVaultId: string;
        if (existing?.id) {
          await credentialVaultClient.updateCredentials({ id: existing.id, body });
          newVaultId = existing.id;
        } else {
          const created = await credentialVaultClient.createCredentials({ body });
          newVaultId = created.id;
        }

        setVaultId(newVaultId);
        persistVaultId(newVaultId);
        setSaveStatus("saved");
      } catch (err: unknown) {
        setSaveStatus("error");
        setSaveError(String((err as Error)?.message ?? err));
      }
    },
    [vaultCredName, persistVaultId],
  );

  const linkExisting = useCallback(
    (id: string) => {
      setVaultId(id);
      persistVaultId(id);
      setSaveStatus("saved");
    },
    [persistVaultId],
  );

  const discoverVaults = useCallback(() => {
    setDiscoveryStatus("searching");
    setExistingVaults([]);

    credentialVaultClient
      .listCredentials({ name: VAULT_NAME_PREFIX })
      .then((result) => {
        const found = (result.credentials ?? []).flatMap((cr) =>
          cr.name?.startsWith(VAULT_NAME_PREFIX) && cr.id && cr.name
            ? [{ id: cr.id, name: cr.name }]
            : [],
        );
        setExistingVaults(found);
        setDiscoveryStatus("done");
      })
      .catch(() => {
        setDiscoveryStatus("error");
        setExistingVaults([]);
      });
  }, []);

  const resetStatus = useCallback(() => {
    setSaveStatus("idle");
    setSaveError("");
  }, []);

  return {
    isConfigured: !!vaultId,
    vaultId,
    saveStatus,
    saveError,
    discoveryStatus,
    existingVaults,
    save,
    linkExisting,
    discoverVaults,
    resetStatus,
  };
}
