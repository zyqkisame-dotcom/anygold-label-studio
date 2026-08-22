import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = protocol + "://" + host;

  return {
    metadataBase: new URL(origin),
    title: "ANYGOLD Label Studio",
    description: "A clean local workspace for creating and printing ANYGOLD jewellery tags.",
    openGraph: {
      title: "ANYGOLD Label Studio",
      description: "Label printing, made simple.",
      images: [new URL("/og.png", origin).toString()],
    },
    twitter: {
      card: "summary_large_image",
      title: "ANYGOLD Label Studio",
      description: "Label printing, made simple.",
      images: [new URL("/og.png", origin).toString()],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
