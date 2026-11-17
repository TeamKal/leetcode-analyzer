import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { EntryCard } from "@/components/ui/EntryCard";

type EnrollmentRequiredPageProps = {
  searchParams: Promise<{ issue?: string }>;
};

export default async function EnrollmentRequiredPage({
  searchParams,
}: EnrollmentRequiredPageProps) {
  const { issue } = await searchParams;
  const heading =
    issue === "link"
      ? "We couldn't verify your enrollment"
      : "No matching enrollment found";

  return (
    <EntryCard
      id="enrollment-title"
      title={heading}
      actions={
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      }
    >
      Please contact your mentor and confirm that you signed in with the Google
      account used for your student enrollment.
    </EntryCard>
  );
}
