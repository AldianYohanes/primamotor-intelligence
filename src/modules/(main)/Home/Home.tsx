import { Container, Stack } from "@mantine/core";
import { Information, Navigation } from "./subcomponents/";

interface Props {
  ctaLabel?: string;
  ctaHref?: string;
}

const Home = ({ ctaLabel, ctaHref }: Props) => {
  return (
    <Container size="md" ta="center">
      <Stack gap="lg">
        <Information ctaLabel={ctaLabel} ctaHref={ctaHref} />
        <Navigation />
      </Stack>
    </Container>
  );
};

export default Home;
