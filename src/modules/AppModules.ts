import {
  IconBrandSupabase,
  IconDashboard,
  IconMessageChatbot,
} from "@tabler/icons-react";
import React from "react";

export interface IAppModules {
  key: string | number;
  label: string;
  description?: string;
  Icon: React.ElementType;
  iconColor?: string;
  accentColor?: string;
}
export const AppModules: IAppModules[] = [
  {
    key: "chatbot",
    label: "Chatbot",
    description: "Tanya Stokgent terkait stok gudang/toko Anda",
    Icon: IconMessageChatbot,
    iconColor: "blue",
    accentColor: "blue",
  },
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Buka Dashboard untuk Melihat Sales Report",
    Icon: IconDashboard,
    iconColor: "orange",
    accentColor: "#cd6146",
  },
  {
    key: "database",
    label: "Database",
    description: "Buka Supabase untuk melihat database lebih lengkap",
    Icon: IconBrandSupabase,
    iconColor: "#3ecf8e",
    accentColor: "#3ecf8e",
  },
];
