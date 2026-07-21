import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@/src/styles/globals.css";

import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import type { Metadata } from "next";
import { Forum, Outfit } from "next/font/google";
import { Providers } from "../lib/mantine/providers";
import { createClient } from "../lib/supabase/server";
import { SessionProvider } from "../lib/supabase/session-provider";
import { Header, Footer } from "../components/Layout";

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
  title: "Stokgent",
  description: "Healthcare intelligence application",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html
      lang="id"
      {...mantineHtmlProps}
      className={`${outfit.variable} ${forum.variable}`}
    >
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
        <link rel="shortcut icon" href="/favicon.svg" />
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width, user-scalable=no"
        />
      </head>
      <body>
        <Providers>
          <SessionProvider initialUser={user}>
            <Header />
            {children}
            <Footer />
          </SessionProvider>
        </Providers>
      </body>
    </html>
  );
}
