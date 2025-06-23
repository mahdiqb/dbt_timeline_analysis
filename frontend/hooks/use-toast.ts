import { useState } from "react";

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

let toastCount = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = ({ title, description, variant = "default" }: Omit<Toast, "id">) => {
    const id = (++toastCount).toString();
    const newToast: Toast = { id, title, description, variant };
    
    setToasts((prev) => [...prev, newToast]);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter(t => t.id !== id));
    }, 5000);
    
    return {
      id,
      dismiss: () => setToasts((prev) => prev.filter(t => t.id !== id)),
      update: (props: Partial<Toast>) => 
        setToasts((prev) => prev.map(t => t.id === id ? { ...t, ...props } : t))
    };
  };

  return {
    toast,
    toasts,
    dismiss: (toastId: string) => 
      setToasts((prev) => prev.filter(t => t.id !== toastId))
  };
}