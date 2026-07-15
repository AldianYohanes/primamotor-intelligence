import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { ColorSchemeToggle } from "../components/ColorSchemeToggle";

export default function HomePage() {
  return (
    <Container size="md" py={64}>
      <Group justify="space-between" mb={48}>
        <Badge variant="light" color="accent" radius="sm">
          Healthcare Intelligence
        </Badge>
        <ColorSchemeToggle />
      </Group>

      <Stack gap="xs" mb={40}>
        <Title order={1}>Stokgent Design System</Title>
        <Text c="dimmed" size="lg">
          Base theme untuk Mantine — Outfit sebagai body font, Forum sebagai
          display font, siap dipakai lintas modul.
        </Text>
      </Stack>

      <Card>
        <Stack gap="md">
          <Title order={3}>Component Preview</Title>
          <Text size="sm" c="dimmed">
            Card ini pakai default radius &amp; border dari theme (bukan
            override manual di setiap pemakaian).
          </Text>
          <Group>
            <Button>Primary Action</Button>
            <Button variant="light">Secondary</Button>
            <Button variant="outline">Outline</Button>
          </Group>
        </Stack>
      </Card>
    </Container>
  );
}
