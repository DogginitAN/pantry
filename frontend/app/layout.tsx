import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: "400",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FAF7F2",
};

export const metadata: Metadata = {
  title: "Pantry",
  description: "AI-powered grocery intelligence",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pantry",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable} bg-cream text-warm-800`}>
      <body className="antialiased bg-cream text-warm-800 min-h-screen flex">
        <ServiceWorkerRegistration />
        <Sidebar />
        <main className="flex-1 px-6 pb-6 pt-14 md:pt-6 overflow-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
