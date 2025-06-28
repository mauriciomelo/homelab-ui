import { cn } from "@/lib/utils";

export function Status({
  color,
  animate,
}: {
  color: "green" | "orange" | "red" | "blue" | "gray";
  animate: boolean;
}) {
  const shared = cn("inline-flex h-full w-full rounded-full bg-gray-400", {
    "bg-green-400": color === "green",
    "bg-orange-400": color === "orange",
    "bg-red-400": color === "red",
    "bg-blue-400": color === "blue",
  });

  return (
    <span className="relative flex size-2">
      <span
        className={cn(shared, "absolute opacity-50", {
          "animate-ping": animate,
        })}
      ></span>
      <span className={cn(shared, "relative")}></span>
    </span>
  );
}
