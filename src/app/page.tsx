import Link from "next/link";
import { Button, Group, Stack, Text } from "@mantine/core";
import { createClient } from "@/lib/supabase/server";
import { ColorSchemeToggle } from "@/src/components/ColorSchemeToggle";
import { Footer } from "@/src/components/Layout";
import Home from "@/src/modules/(main)/Home/Home";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <Stack mih="100dvh" pb="10dvh" gap={0}>
      <Group justify="space-between" px="md" py="sm">
        <Text fw={700} fz="sm">
          Prima Motor Volvo
        </Text>
        <Group gap="xs">
          <ColorSchemeToggle />
          {user ? (
            <Link href="/chat" style={{ textDecoration: "none" }}>
              <Button component="span" size="xs" radius="xl">
                Buka Chat
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/login" style={{ textDecoration: "none" }}>
                <Button
                  component="span"
                  variant="subtle"
                  color="dark"
                  size="xs"
                  radius="xl"
                >
                  Masuk
                </Button>
              </Link>
              <Link href="/signup" style={{ textDecoration: "none" }}>
                <Button component="span" size="xs" radius="xl">
                  Daftar
                </Button>
              </Link>
            </>
          )}
        </Group>
      </Group>

      <Home
        ctaLabel={user ? "Buka Chat" : "Masuk ke Akun Toko"}
        ctaHref={user ? "/chat" : "/login"}
      />

      <Footer />
    </Stack>
  );
}
