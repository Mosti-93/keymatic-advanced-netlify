"use client";
import { useRequireRole, CheckingAccess } from "@/utils/useRequireRole";

// Every page in this (admin) folder is for admins only.
// The folder name in brackets does not change any URLs.
export default function AdminLayout({ children }) {
  const { checking } = useRequireRole(["admin"]);
  if (checking) return <CheckingAccess />;
  return children;
}
