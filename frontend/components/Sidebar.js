"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cooperatives", label: "Cooperatives" },
  { href: "/field-ops", label: "Field Visits" },
  { href: "/leave", label: "Leave" },
  { href: "/disbursements", label: "Farmer Disbursements", roles: ["NATIONAL_ADMIN", "DIRECTOR", "SUBCOUNTY_OFFICER"] },
  { href: "/staff", label: "Staff & Access", roles: ["NATIONAL_ADMIN", "DIRECTOR", "SUBCOUNTY_OFFICER"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-60 flex-col justify-between border-r border-gray-200 bg-white">
      <div>
        <div className="h-1 w-full bg-kenya-stripe" />
        <div className="border-b border-gray-200 px-4 py-4">
          <p className="text-sm font-bold text-kenya-black">Republic of Kenya</p>
          <p className="text-xs text-gray-500">
            {user?.role === "NATIONAL_ADMIN" ? "National Co-operatives Portal" : (user?.county?.name ? `${user.county.name} County` : "Cooperative Management")}
          </p>
        </div>
        <nav className="p-2">
          {LINKS.filter((l) => !l.roles || l.roles.includes(user?.role)).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`block rounded-md px-3 py-2 text-sm ${
                pathname?.startsWith(l.href)
                  ? "bg-kenya-green/10 font-semibold text-kenya-green"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-gray-200 p-4">
        <p className="text-sm font-medium">{user?.fullName}</p>
        <p className="mb-2 text-xs text-gray-500">{user?.role?.replace(/_/g, " ")}</p>
        <button onClick={logout} className="text-xs font-medium text-kenya-red hover:underline">
          Sign out
        </button>
      </div>
    </aside>
  );
}
