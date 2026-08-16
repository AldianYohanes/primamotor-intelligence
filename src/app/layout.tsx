import type { Metadata, Viewport } from "next";
import "../styles/globals.css";
import { MantineProvider } from "@mantine/core";
import ServiceWorkerRegistration from "../components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Prima Motor Volvo — Manajemen Stok",
  description:
    "Aplikasi manajemen suku cadang Volvo dengan asisten AI berbasis percakapan",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Prima Motor Volvo",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1d4ed8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <MantineProvider>{children}</MantineProvider>

        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
