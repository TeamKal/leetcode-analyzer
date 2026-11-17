import { redirect } from "next/navigation";

/** Mentor provisioning now lives in the Mentors section of the admin page. */
export default function MentorTestPage() {
  redirect("/admin#mentors");
}
