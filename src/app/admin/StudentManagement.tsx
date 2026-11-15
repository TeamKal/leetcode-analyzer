"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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

export function StudentManagement({ students }: { students: AdminStudent[] }) {
  const router = useRouter();
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

  async function handleEnroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnrollmentMessage("");
    setIsEnrolling(true);

    try {
      const result = await enrollStudent({
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
    if (!window.confirm(`Remove ${displayName} from this class?`)) return;

    setRemovalMessage("");
    setRemovingStudentId(student.id);
    try {
      const result = await removeStudent(student.id);
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

  return (
    <section className="admin-section" id="students">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">ENROLLMENT</p>
          <h2>Students</h2>
        </div>
        <span className="admin-count">
          {students.length} {students.length === 1 ? "student" : "students"}
        </span>
      </div>

      <form className="student-enrollment-form" onSubmit={handleEnroll}>
        <label className="student-form-field">
          Full name
          <input
            autoComplete="name"
            maxLength={150}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </label>
        <label className="student-form-field">
          Google email
          <input
            autoComplete="email"
            maxLength={254}
            type="email"
            value={googleEmail}
            onChange={(event) => setGoogleEmail(event.target.value)}
            required
          />
        </label>
        <label className="student-form-field">
          LeetCode username
          <input
            autoComplete="off"
            maxLength={100}
            value={leetcodeUsername}
            onChange={(event) => setLeetcodeUsername(event.target.value)}
            required
          />
        </label>
        <button
          className="button button-primary"
          type="submit"
          disabled={isEnrolling || removingStudentId !== null}
        >
          {isEnrolling ? "Enrolling…" : "Enroll student"}
        </button>
      </form>

      {enrollmentMessage && (
        <p
          className={`student-action-message${enrollmentError ? " is-error" : ""}`}
          role={enrollmentError ? "alert" : "status"}
        >
          {enrollmentMessage}
        </p>
      )}
      {removalMessage && (
        <p
          className={`student-action-message${removalError ? " is-error" : ""}`}
          role={removalError ? "alert" : "status"}
        >
          {removalMessage}
        </p>
      )}

      {students.length === 0 ? (
        <div className="admin-empty-state student-empty-state">
          <p>No enrolled students</p>
          <span>Enroll a student to add them to the main class.</span>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Google email</th>
                <th scope="col">LeetCode username</th>
                <th scope="col">Google account</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td className="admin-class-name">
                    {student.full_name || "—"}
                  </td>
                  <td>{student.google_email}</td>
                  <td>{student.leetcode_username}</td>
                  <td>
                    <span
                      className={`student-link-status${student.user_id ? " is-linked" : ""}`}
                    >
                      <span aria-hidden="true" />
                      {student.user_id ? "Linked" : "Not linked"}
                    </span>
                  </td>
                  <td className="student-action-cell">
                    <button
                      className="text-button student-remove-button"
                      type="button"
                      disabled={
                        isEnrolling ||
                        (removingStudentId !== null &&
                          removingStudentId !== student.id)
                      }
                      onClick={() => void handleRemove(student)}
                    >
                      {removingStudentId === student.id
                        ? "Removing…"
                        : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
