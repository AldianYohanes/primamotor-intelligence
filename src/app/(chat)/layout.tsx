import { AppDock } from "@/src/components/nav/AppDock";

export default function ModuleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AppDock />
    </>
  );
}
