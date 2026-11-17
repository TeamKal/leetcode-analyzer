"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, Section, tableClasses } from "@/components/ui/Section";
import { fieldInputClasses, TextField } from "@/components/ui/TextField";
import { enrollStudent, removeStudent } from "./student-actions";

export type AdminStudent = {
  id: string;
  class_id: string;
  user_id: string | null;
  full_name: string;
  google_email: string;
  leetcode_username: string;
};

const enrollmentErrorMessages: Record<string, string> = {
  unauthorized: "You are not authorized to enroll students.",
  invalid_input: "Check the student details and try again.",
  enrollment_failed:
    "Enrollment could not be completed. Check the details or confirm the student is not already enrolled.",
};

const removalErrorMessages: Record<string, string> = {
  unauthorized: "You are not authorized to remove students.",
  invalid_input: "The selected student is invalid. Refresh and try again.",
  student_not_found: "The student is no longer available. Refresh the list.",
  removal_blocked:
    "This student could not be removed. They may have submissions or another restriction.",
  removal_failed: "Student removal failed. Please try again.",
};

type ActionResult = { ok: true } | { ok: false; error: string };

type StudentManagementProps = {
  students: AdminStudent[];
  /** Defaults to the admin actions; the mentor page passes its own. */
  onEnroll?: (input: {
    fullName: string;
    googleEmail: string;
    leetcodeUsername: string;
    classId?: string;
  }) => Promise<ActionResult>;
  onRemove?: (studentId: string) => Promise<ActionResult>;
  /** Classes the signed-in user can add students to. Omit for the single main class. */
  classes?: { id: string; name: string }[];
};

export function StudentManagement({
  students,
  onEnroll = enrollStudent,
  onRemove = removeStudent,
  classes,
}: StudentManagementProps) {
  const router = useRouter();
  const [classId, setClassId] = useState(classes?.[0]?.id ?? "");
  const [fullName, setFullName] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");
  const [leetcodeUsername, setLeetcodeUsername] = useState("");
  const [enrollmentMessage, setEnrollmentMessage] = useState("");
  const [enrollmentError, setEnrollmentError] = useState(false);
  const [removalMessage, setRemovalMessage] = useState("");
  const [removalError, setRemovalError] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(
    null,
  );
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function handleEnroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnrollmentMessage("");
    setIsEnrolling(true);

    try {
      const result = await onEnroll({
        classId: classes ? classId : undefined,
        fullName,
        googleEmail,
        leetcodeUsername,
      });

      if (result.ok) {
        setEnrollmentError(false);
        setEnrollmentMessage("Student enrolled successfully.");
        setFullName("");
        setGoogleEmail("");
        setLeetcodeUsername("");
        router.refresh();
      } else {
        setEnrollmentError(true);
        setEnrollmentMessage(
          enrollmentErrorMessages[result.error] ??
            "Enrollment could not be completed. Please try again.",
        );
      }
    } catch {
      setEnrollmentError(true);
      setEnrollmentMessage(
        "Enrollment could not be completed. Please try again.",
      );
    } finally {
      setIsEnrolling(false);
    }
  }

  async function handleRemove(student: AdminStudent) {
    const displayName = student.full_name || student.google_email;

    setConfirmingId(null);
    setRemovalMessage("");
    setRemovingStudentId(student.id);
    try {
      const result = await onRemove(student.id);
      if (result.ok) {
        setRemovalError(false);
        setRemovalMessage(`${displayName} was removed.`);
        router.refresh();
      } else {
        setRemovalError(true);
        setRemovalMessage(
          removalErrorMessages[result.error] ??
            "Student removal failed. Please try again.",
        );
      }
    } catch {
      setRemovalError(true);
      setRemovalMessage("Student removal failed. Please try again.");
    } finally {
      setRemovingStudentId(null);
    }
  }

  const busy = isEnrolling || removingStudentId !== null;

  return (
    <Section
      id="students"
      title="Students"
      description="Enroll students by their Google email. They are linked when they first sign in."
      aside={
        <Badge>
          {students.length} {students.length === 1 ? "student" : "students"}
        </Badge>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"
        onSubmit={handleEnroll}
      >
        <TextField
          label="Full name"
          autoComplete="name"
          maxLength={150}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          required
        />
        <TextField
          label="Google email"
          autoComplete="email"
          maxLength={254}
          type="email"
          value={googleEmail}
          onChange={(event) => setGoogleEmail(event.target.value)}
          required
        />
        <TextField
          label="LeetCode username"
          autoComplete="off"
          maxLength={100}
          value={leetcodeUsername}
          onChange={(event) => setLeetcodeUsername(event.target.value)}
          required
        />
        {classes && classes.length > 1 && (
          <label className="block min-w-0 text-[13px] font-medium text-ink-2 sm:col-span-2 lg:col-span-4">
            Class
            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className={`mt-1.5 font-normal sm:max-w-[320px] ${fieldInputClasses}`}
            >
              {classes.map((classRow) => (
                <option key={classRow.id} value={classRow.id}>
                  {classRow.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button type="submit" disabled={busy} className="sm:col-span-2 lg:col-span-1">
          {isEnrolling ? "Enrolling…" : "Enroll student"}
        </Button>
      </form>

      {enrollmentMessage && (
        <div className="mt-4" aria-live="polite">
          <Alert tone={enrollmentError ? "error" : "info"}>
            {enrollmentMessage}
          </Alert>
        </div>
      )}
      {removalMessage && (
        <div className="mt-4" aria-live="polite">
          <Alert tone={removalError ? "error" : "info"}>{removalMessage}</Alert>
        </div>
      )}

      <div className="mt-6">
        {students.length === 0 ? (
          <EmptyState title="No enrolled students">
            Enroll a student to add them to the main class.
          </EmptyState>
        ) : (
          <div className={tableClasses.wrap}>
            <table className={tableClasses.table}>
              <thead>
                <tr>
                  <th scope="col" className={tableClasses.th}>Student</th>
                  <th scope="col" className={tableClasses.th}>Google email</th>
                  <th scope="col" className={tableClasses.th}>LeetCode</th>
                  {classes && classes.length > 1 && (
                    <th scope="col" className={tableClasses.th}>Class</th>
                  )}
                  <th scope="col" className={tableClasses.th}>Google account</th>
                  <th scope="col" className={tableClasses.th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const displayName = student.full_name || student.google_email;
                  const confirming = confirmingId === student.id;
                  return (
                    <tr key={student.id}>
                      <td className={`${tableClasses.td} font-medium text-ink`}>
                        {student.full_name || "—"}
                      </td>
                      <td className={tableClasses.td}>{student.google_email}</td>
                      <td className={tableClasses.td}>{student.leetcode_username}</td>
                      {classes && classes.length > 1 && (
                        <td className={tableClasses.td}>
                          {classes.find((c) => c.id === student.class_id)?.name ?? "–"}
                        </td>
                      )}
                      <td className={tableClasses.td}>
                        <Badge tone={student.user_id ? "success" : "neutral"}>
                          {student.user_id ? "Linked" : "Not linked"}
                        </Badge>
                      </td>
                      <td className={`${tableClasses.td} text-right`}>
                        {confirming ? (
                          <span className="inline-flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={busy}
                              aria-label={`Confirm removing ${displayName}`}
                              onClick={() => void handleRemove(student)}
                            >
                              Remove
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmingId(null)}
                            >
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            aria-label={`Remove ${displayName}`}
                            onClick={() => setConfirmingId(student.id)}
                          >
                            {removingStudentId === student.id
                              ? "Removing…"
                              : "Remove"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
  );
}
