import { ActionIcon, Avatar, Group, Stack, Text } from "@mantine/core";
import { IconMenu } from "@tabler/icons-react";

export const Header = () => {
  return (
    <Stack
      style={{ borderBottom: "0.5px solid rgba(48, 47, 44, 0.5)" }}
      h="7dvh"
      justify="center"
    >
      <Group justify="space-between" px="xs">
        <Group>
          <ActionIcon p={0} variant="outline" color="dark">
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
  );
};
