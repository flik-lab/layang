import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges conditional class names using the same helper convention as shadcn/ui. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
