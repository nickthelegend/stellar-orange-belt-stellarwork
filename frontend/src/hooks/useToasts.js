import { useCallback, useState } from "react";

// Minimal toast queue. Each toast auto-dismisses; errors linger a little longer.
let counter = 0;

export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (type, message, ttl) => {
      const id = ++counter;
      setToasts((t) => [...t, { id, type, message }]);
      const timeout = ttl ?? (type === "error" ? 7000 : 4500);
      setTimeout(() => dismiss(id), timeout);
      return id;
    },
    [dismiss]
  );

  const toast = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return { toasts, toast, dismiss };
}
