import { SkeletonChat } from "@/src/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col justify-end p-4">
      <SkeletonChat />
    </div>
  );
}
