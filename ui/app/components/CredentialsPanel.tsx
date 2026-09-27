import React, { useEffect, useState } from "react";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { Button } from "@dynatrace/strato-components/buttons";
import { TextInput } from "@dynatrace/strato-components/forms";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import type { UseCredentialsReturn } from "../hooks/useCredentials";

interface CredentialsPanelProps {
  show: boolean;
  onDismiss: () => void;
  credentials: UseCredentialsReturn;
}

export function CredentialsPanel({ show, onDismiss, credentials }: CredentialsPanelProps) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const { saveStatus, saveError, existingVaults, discoveryStatus, save, linkExisting, discoverVaults, resetStatus } =
    credentials;

  useEffect(() => {
    if (show) {
      discoverVaults();
      resetStatus();
    }
  }, [show, discoverVaults, resetStatus]);

  const handleSave = async () => {
    await save(clientId, clientSecret);
    if (saveStatus !== "error") {
      setClientId("");
      setClientSecret("");
    }
  };

  const handleDismiss = () => {
    setClientId("");
    setClientSecret("");
    resetStatus();
    onDismiss();
  };

  return (
    <Sheet
      title="OAuth2 Credentials"
      show={show}
      onDismiss={handleDismiss}
      actions={
        <Flex gap={8}>
          <Button
            variant="emphasized"
            onClick={() => { void handleSave(); }}
            disabled={saveStatus === "saving" || !clientId.trim() || !clientSecret.trim()}
          >
            {saveStatus === "saving" ? "Saving…" : "Save"}
          </Button>
          <Button variant="default" onClick={handleDismiss}>
            Cancel
          </Button>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={16} padding={16}>
        <Text>
          Enter OAuth2 Client Credentials. The secret is stored in the Dynatrace Credential Vault
          and never saved in plain text.
        </Text>

        <Flex flexDirection="column" gap={8}>
          <Flex flexDirection="column" gap={4}>
            <Text>Client ID</Text>
            <TextInput
              value={clientId}
              onChange={(v) => { setClientId(v); }}
              placeholder="dt0s21.XXXXXXXXXXXX"
            />
          </Flex>
          <Flex flexDirection="column" gap={4}>
            <Text>Client Secret</Text>
            <TextInput
              value={clientSecret}
              onChange={(v) => { setClientSecret(v); }}
              placeholder="dt0s21.XXXXXXXXXXXX.XXXXXXXX…"
            />
          </Flex>
        </Flex>

        {saveStatus === "saved" && (
          <Text style={{ color: Colors.Text.Success.Default }}>
            Credentials saved to Credential Vault.
          </Text>
        )}
        {saveStatus === "error" && saveError && (
          <Text style={{ color: Colors.Text.Critical.Default }}>{saveError}</Text>
        )}

        {existingVaults.length > 0 && (
          <Flex flexDirection="column" gap={8}>
            <Text style={{ fontWeight: "bold" }}>
              Or link an existing vault entry:
            </Text>
            {existingVaults.map((v) => (
              <Flex key={v.id} gap={8} alignItems="center">
                <Text style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {v.name}
                </Text>
                <Button
                  variant="default"
                  onClick={() => {
                    linkExisting(v.id);
                    onDismiss();
                  }}
                >
                  Link
                </Button>
              </Flex>
            ))}
          </Flex>
        )}

        {discoveryStatus === "searching" && (
          <Text>Searching for existing vault entries…</Text>
        )}
      </Flex>
    </Sheet>
  );
}
