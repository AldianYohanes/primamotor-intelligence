import type { Metadata, Viewport } from "next";
import { Inter, Outfit, Forum } from "next/font/google";
import "../styles/globals.css";
import { PwaProvider } from "../components/pwa/PwaProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const forum = Forum({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-forum",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "Prima Motor",
  title: "Prima Motor Volvo — Manajemen Stok",
  description:
    "Aplikasi manajemen suku cadang Volvo dengan asisten AI berbasis percakapan",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
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
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${inter.variable} ${outfit.variable} ${forum.variable}`}
      suppressHydrationWarning
    >
      <body>
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
