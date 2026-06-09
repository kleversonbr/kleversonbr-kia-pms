import React, { createContext, useContext, useState, useEffect } from "react";
import { Bell, CheckCircle, AlertTriangle, Info, X } from "lucide-react";
import { Notificacao } from "../types";

interface NotificationContextProps {
  notifications: Notificacao[];
  addNotification: (titulo: string, mensagem: string, tipo?: Notificacao["tipo"]) => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
  requestPermission: () => void;
  permissionStatus: NotificationPermission;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications deve ser usado dentro de um NotificationProvider");
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notificacao[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
    typeof window !== "undefined" ? Notification.permission : "default"
  );

  const requestPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const status = await Notification.requestPermission();
      setPermissionStatus(status);
    }
  };

  const addNotification = (titulo: string, mensagem: string, tipo: Notificacao["tipo"] = "info") => {
    const newNotif: Notificacao = {
      id: Math.random().toString(36).substr(2, 9),
      titulo,
      mensagem,
      tipo,
      lida: false,
      data: new Date().toISOString(),
    };

    setNotifications((prev) => [newNotif, ...prev]);

    // Auto mark as read (close toast) after 2 seconds
    setTimeout(() => {
      markAsRead(newNotif.id);
    }, 2000);

    // HTML5 Push notification
    if (permissionStatus === "granted" && typeof window !== "undefined") {
      try {
        const nativeNotif = new Notification(titulo, {
          body: mensagem,
          icon: "/logo.png",
        });
        // Auto close native push notification after 2 seconds
        setTimeout(() => {
          nativeNotif.close();
        }, 2000);
      } catch (e) {
        console.error("Erro ao disparar notificação push nativa:", e);
      }
    }
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, lida: true } : n))
    );
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        markAsRead,
        clearAll,
        requestPermission,
        permissionStatus,
      }}
    >
      {children}
      {/* Toast Overlay for Active Alert Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
        {notifications.filter((n) => !n.lida).slice(0, 3).map((notif) => (
          <div
            key={notif.id}
            className="flex items-start gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-lg ring-1 ring-black/5 animate-fade-in relative overflow-hidden"
          >
            {/* Status slide-in line accent */}
            <div className={`absolute top-0 bottom-0 left-0 w-1 ${
              notif.tipo === "success" ? "bg-emerald-500" :
              notif.tipo === "warning" ? "bg-amber-500" :
              notif.tipo === "error" ? "bg-rose-500" : "bg-blue-500"
            }`} />

            <div className="flex-shrink-0 ml-1">
              {notif.tipo === "success" && <CheckCircle className="w-5 h-5 text-emerald-500" />}
              {notif.tipo === "warning" && <AlertTriangle className="w-5 h-5 text-amber-500" />}
              {notif.tipo === "error" && <AlertTriangle className="w-5 h-5 text-rose-500" />}
              {notif.tipo === "info" && <Info className="w-5 h-5 text-blue-500" />}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{notif.titulo}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{notif.mensagem}</p>
            </div>

            <button
              onClick={() => markAsRead(notif.id)}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};
