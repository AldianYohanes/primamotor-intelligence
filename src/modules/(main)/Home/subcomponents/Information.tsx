import { ActionIcon, Button, Stack, Title } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";

export const Information = () => {
  return (
    <Stack mt="5vh" align="center" justify="center" gap="xs">
      <Title style={{ lineHeight: 1 }}>Prima Motor Volvo</Title>
      <Title order={6} maw="80%">
        Sistem Manajemen Suku Cadang Otomotif Berbasis WebLLM
      </Title>

      <Button
        color="dark"
        size="xs"
        radius="xl"
        rightSection={
          <ActionIcon size="xs" color="white">
            <IconChevronRight color="black" />
          </ActionIcon>
        }
      >
        Pelajari Lebih Lanjut
      </Button>
    </Stack>
  );
};
