/**
 * useWorkflow — Workflow discovery, trigger, and poll hook.
 *
 * Discovers the workflow by its fixed ID, triggers it with { enabledCategories } params,
 * and polls until the execution reaches a terminal state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  executionsClient,
  workflowsClient,
} from "@dynatrace-sdk/client-automation";
import { WORKFLOW_ID, WORKFLOW_TITLE } from "../types/scanner";

export type WorkflowStatus = "idle" | "running" | "success" | "error" | "not-found";

export interface UseWorkflowReturn {
  /** Whether the workflow has been found and is ready to trigger. */
  workflowFound: boolean;
  status: WorkflowStatus;
  /** Non-sensitive status message suitable for display. */
  statusMessage: string;
  isRunning: boolean;
  /**
   * Trigger the workflow with the given enabled categories.
   * Resolves when the execution reaches a terminal state.
   * @param enabledCategories - Map of category key → enabled boolean; false = skip that category.
   * @param onSuccess - Called after a successful execution, e.g. to reload data.
   */
  trigger: (enabledCategories: Record<string, boolean>, onSuccess?: () => void) => Promise<void>;
}

const POLL_INTERVAL_MS = 5_000;

export function useWorkflow(): UseWorkflowReturn {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [status, setStatus] = useState<WorkflowStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSuccessRef = useRef<(() => void) | undefined>(undefined);

  // Discover the workflow by fixed ID, once on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const wf = await workflowsClient.getWorkflow({ id: WORKFLOW_ID });
        if (!cancelled) {
          if (wf?.id) {
            setWorkflowId(wf.id);
          } else {
            setStatus("not-found");
            setStatusMessage(
              `Workflow "${WORKFLOW_TITLE}" not found. Import the workflow JSON and try again.`,
            );
          }
        }
      } catch {
        setStatus("not-found");
        setStatusMessage(
          `Workflow "${WORKFLOW_TITLE}" not found. Import the workflow JSON and try again.`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Clean up any pending poll timer on unmount.
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const schedulePoll = useCallback((execId: string) => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollTimerRef.current = setTimeout(() => {
      void pollExecution(execId);
    }, POLL_INTERVAL_MS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pollExecution = useCallback(
    async (execId: string) => {
      try {
        const exec = await executionsClient.getExecution({ id: execId });
        const st = exec.state;

        if (st === "RUNNING" || st === "PAUSED") {
          setStatusMessage(`Workflow ${st.toLowerCase()}…`);
          schedulePoll(execId);
          return;
        }

        if (st === "SUCCESS") {
          setStatus("success");
          setStatusMessage(`Scan completed · ${new Date().toLocaleTimeString()}`);
          onSuccessRef.current?.();
          onSuccessRef.current = undefined;
          return;
        }

        // FAILED, TIMEOUT, CANCELLED, etc.
        setStatus("error");
        setStatusMessage(`Workflow ${st}: see Dynatrace Automations for details.`);
      } catch (err: unknown) {
        setStatus("error");
        setStatusMessage(`Polling error: ${String((err as Error)?.message ?? err)}`);
      }
    },
    [schedulePoll],
  );

  const trigger = useCallback(
    async (enabledCategories: Record<string, boolean>, onSuccess?: () => void): Promise<void> => {
      if (!workflowId) {
        setStatus("not-found");
        setStatusMessage(
          `Workflow "${WORKFLOW_TITLE}" not found. Import the workflow JSON and try again.`,
        );
        return;
      }

      onSuccessRef.current = onSuccess;
      setStatus("running");
      setStatusMessage("Starting workflow…");

      try {
        const exec = await workflowsClient.runWorkflow({
          id: workflowId,
          body: { params: { enabledCategories } },
        });
        setStatusMessage("Workflow running…");
        schedulePoll(exec.id);
      } catch (err: unknown) {
        setStatus("error");
        setStatusMessage(`Failed to start workflow: ${String((err as Error)?.message ?? err)}`);
        onSuccessRef.current = undefined;
      }
    },
    [workflowId, schedulePoll],
  );

  return {
    workflowFound: !!workflowId,
    status,
    statusMessage,
    isRunning: status === "running",
    trigger,
  };
}
