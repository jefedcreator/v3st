import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Browser-safe: do not import the Node-only utils barrel into client islands. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
