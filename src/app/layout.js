import { Inter } from "next/font/google";
import "./globals.css";
import AuthSessionHandler from "./AuthSessionHandler";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "Keymatic",
  description: "Smart key pickup and management",
};

export const viewport = {
  themeColor: "#f5f5f7",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <AuthSessionHandler>{children}</AuthSessionHandler>
      </body>
    </html>
  );
}
