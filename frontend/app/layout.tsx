import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEC EDGAR RAG Demo — pgvector + LangChain",
  description: "Index SEC 10-K / 10-Q filings and query them with grounded LLM answers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
