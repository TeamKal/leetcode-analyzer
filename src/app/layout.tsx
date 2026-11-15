import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Audio — Video Transcription",
  description:
    "Capture audio from a video and transcribe it privately in your browser. Your files stay on your device.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
