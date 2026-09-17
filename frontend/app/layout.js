import "./globals.css";
import { AuthProvider } from "../context/AuthContext";

export const metadata = {
  title: "National Cooperative Management & Governance System — Republic of Kenya",
  description: "State Department for Co-operatives — cooperative registry, governance, and field operations for all 47 counties of Kenya.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
