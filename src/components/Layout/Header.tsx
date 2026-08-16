"use client";

import { AppModules } from "@/src/modules/AppModules";
import {
  ActionIcon,
  Avatar,
  Drawer,
  Group,
  NavLink,
  Stack,
  Text,
} from "@mantine/core";
import { IconMenu } from "@tabler/icons-react";
import { useState } from "react";

export const Header = () => {
  const [drawer, setDrawer] = useState<boolean>(false);
  return (
    <>
      <Stack
        style={{ borderBottom: "0.5px solid rgba(48, 47, 44, 0.5)" }}
        h="7dvh"
        justify="center"
      >
        <Group justify="space-between" px="xs">
          <Group>
            <ActionIcon
              p={0}
              variant="outline"
              color="dark"
              onClick={() => setDrawer(!drawer)}
            >
              <IconMenu size={12} />
            </ActionIcon>
          </Group>

          <Group gap={4}>
            <Stack gap={0} align="end">
              <Text fz={12} style={{ lineHeight: 1 }}>
                Aldian Yohanes
              </Text>
              <Text fz={10} style={{ lineHeight: 1 }}>
                Super Admin
              </Text>
            </Stack>
            <Avatar />
          </Group>
        </Group>
      </Stack>
      <Drawer
        size="sm"
        bdrs="xl"
        opened={drawer}
        onClose={() => setDrawer(false)}
      >
        {AppModules.map((mod) => {
          const Icon = mod.Icon;
          return (
            <NavLink key={mod.key} leftSection={<Icon />} label={mod.label} />
          );
        })}
      </Drawer>
    </>
  );
};
