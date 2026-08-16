import { AppModules } from "@/src/modules/AppModules";
import { lighten } from "@/src/utils/colorUtils";
import { getRandomInt } from "@/src/utils/mathUtils";
import {
  Box,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";

export const Navigation = () => {
  // const {ref, hovered} = useHover();
  return (
    <>
      <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing={8}>
        {AppModules.map((mod) => {
          const Icon = mod.Icon;
          return (
            <Card key={mod.key} shadow="xs">
              <Box
                style={{
                  top: `${getRandomInt(0, 100)}%`,
                  left: `${getRandomInt(0, 100)}%`,
                  background: mod.accentColor,
                  height: 250,
                  width: 350,
                  opacity: 0.1,
                  borderRadius: "50%",
                  position: "absolute",
                  zIndex: 0,
                }}
              />
              <Box
                style={{
                  bottom: `${getRandomInt(0, 100)}%`,
                  right: `${getRandomInt(0, 100)}%`,
                  background: mod.accentColor && lighten(mod.accentColor, 50),
                  height: 250,
                  width: 350,
                  opacity: 0.2,
                  borderRadius: "50%",
                  position: "absolute",
                  zIndex: 0,
                }}
              />
              <Group wrap="nowrap" ta="left">
                <Stack>
                  <Icon color={mod.iconColor} />
                </Stack>
                <Stack gap={0}>
                  <Title order={6} fw={700}>
                    {mod.label}
                  </Title>

                  <Text fz="xs" fw={300}>
                    {mod.description}
                  </Text>
                </Stack>
              </Group>
            </Card>
          );
        })}
      </SimpleGrid>
    </>
  );
};
