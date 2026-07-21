import { Affix, Group, Image, Stack, Text } from "@mantine/core";

export const Footer = () => {
  return (
    <Affix position={{ bottom: 0, left: 0, right: 0 }}>
      <Stack
        style={{ borderTop: "0.5px solid rgba(48, 47, 44, 0.5)" }}
        h="7dvh"
        justify="center"
      >
        <Group justify="space-between" px="xs">
          <Stack gap={0} maw="40%">
            <Text fz={10} style={{ lineHeight: 1 }}>
              Prima Motor Volvo
            </Text>
            <Text fz={8}>Lantai 3A, Blok M Square, Jakarta Selatan</Text>
          </Stack>

          <Image
            src="logos/prima-motor.png"
            w={24}
            h={24}
            alt="Logo Prima Motor Volvo"
          />
        </Group>
      </Stack>
    </Affix>
  );
};
