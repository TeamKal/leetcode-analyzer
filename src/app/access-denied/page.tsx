import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { EntryCard } from "@/components/ui/EntryCard";

export default function AccessDeniedPage() {
  return (
    <EntryCard
      id="access-denied-title"
      title="Access could not be verified"
      actions={
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      }
    >
      Your account does not have an active application role, or we could not
      verify it. Contact an administrator for help.
    </EntryCard>
  );
}
