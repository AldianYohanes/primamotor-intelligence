"use client";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { theme } from "./theme";
import { cssVariablesResolver } from "./cssVariablesResolver";
import { ModalsProvider } from "@mantine/modals";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="light"
    >
      <ModalsProvider modalProps={{ radius: "lg" }}>
        <Notifications position="top-right" limit={4} autoClose={4000} />
        {children}
      </ModalsProvider>
    </MantineProvider>
  );
}
