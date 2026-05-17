import { redirect } from "next/navigation";

/**
 * Redirects root traffic directly to the workbench.
 */
export default function HomePage() {
  redirect("/playground");
}
