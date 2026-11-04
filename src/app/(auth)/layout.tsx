import { PublicShell } from "@/src/components/info/PublicShell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
