import { Information, Navigation } from "./subcomponents/";

interface Props {
  ctaLabel?: string;
  ctaHref?: string;
}

const Home = ({ ctaLabel, ctaHref }: Props) => {
  return (
    <div className="mx-auto max-w-3xl px-4 text-center">
      <div className="flex flex-col gap-6">
        <Information ctaLabel={ctaLabel} ctaHref={ctaHref} />
        <Navigation />
      </div>
    </div>
  );
};

export default Home;
