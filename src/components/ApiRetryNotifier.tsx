import { useEffect } from "react";
import { toast } from "sonner";
import { API_RETRY_MESSAGE, subscribeApiRetryStatus } from "../lib/api";

const RETRY_TOAST_ID = "api-retry-status";

/** Shows a global toast while fetchWithRetry is waiting between attempts. */
export function ApiRetryNotifier() {
  useEffect(() => {
    return subscribeApiRetryStatus((status, message) => {
      if (status === "retrying") {
        toast.loading(message || API_RETRY_MESSAGE, { id: RETRY_TOAST_ID });
        return;
      }
      toast.dismiss(RETRY_TOAST_ID);
    });
  }, []);

  return null;
}
