import { ActionIcon, Button, Stack, Title } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";

interface Props {
  /** Teks tombol CTA utama. */
  ctaLabel?: string;
  /** Tujuan tombol CTA utama. */
  ctaHref?: string;
}

export const Information = ({
  ctaLabel = "Pelajari Lebih Lanjut",
  ctaHref = "/login",
}: Props) => {
  return (
    <Stack mt="5vh" align="center" justify="center" gap="xs">
      <Title style={{ lineHeight: 1 }}>Prima Motor Volvo</Title>
      <Title order={6} maw="80%">
        Sistem Manajemen Suku Cadang Otomotif Berbasis WebLLM
      </Title>

      {/* Button dibungkus <Link>, bukan `component={Link}` — Information
          adalah Server Component, jadi melempar referensi fungsi (Link)
          sebagai prop ke Button (Client Component) bikin React gagal
          serialize ("Functions cannot be passed directly to Client
          Components..."). Button di-render sebagai <span> (bukan <button>
          default) supaya valid disarangkan di dalam <a> dari Link. */}
      <Link href={ctaHref} style={{ textDecoration: "none" }}>
        <Button
          component="span"
          color="dark"
          size="xs"
          radius="xl"
          rightSection={
            <ActionIcon size="xs" color="white">
              <IconChevronRight color="black" />
            </ActionIcon>
          }
        >
          {ctaLabel}
        </Button>
      </Link>
    </Stack>
  );
};
