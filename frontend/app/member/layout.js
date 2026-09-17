import { MemberAuthProvider } from "../../context/MemberAuthContext";

export const metadata = {
  title: "My Cooperative — Member Portal",
  description: "View your contributions, produce deliveries, and payouts.",
};

export default function MemberLayout({ children }) {
  return <MemberAuthProvider>{children}</MemberAuthProvider>;
}
