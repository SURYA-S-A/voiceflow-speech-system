import "../../globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";
import { AppThemeProvider } from "@/components/theme/AppThemeProvider";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Friday - AI Voice Bot",
    description: "Voice & Speech Support (STT + TTS + VAD)",
};

export default function VoiceChatBotLayout({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning
            style={{
                "--primary-color": "#10b981",
                "--secondary-color": "#059669",
            } as React.CSSProperties}
        >
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
                <AppThemeProvider attribute="class" defaultTheme="system" enableSystem>
                    {children}
                </AppThemeProvider>
            </body>
        </html>
    );
}