import { Container, Stack } from "@mantine/core";
import { Information, Navigation } from "./subcomponents/";

const Home = () => {
  return (
    <Container size="md" ta="center">
      <Stack gap="lg">
        <Information />
        <Navigation />
      </Stack>
    </Container>
  );
};

export default Home;
