/**
 * Matriks hak akses satu sumber (dipakai server & client). Sesuai naskah
 * (bab 3, "Use Case dan Batasan Akses Aktor"):
 *
 *   Aktor naskah                 | enum user_role di DB
 *   -----------------------------|---------------------
 *   Staf Kasir                   | staff
 *   Admin/Owner (tenant sendiri) | owner
 *   Super Admin (pemilik app)    | admin
 *
 * Nilai enum tidak di-rename karena dipakai RLS (is_super_admin() = role 'admin').
 * File ini murni (tanpa import server/client) supaya bisa dites dan dipakai
 * di komponen client untuk menyembunyikan menu.
 */

export type Role = "admin" | "owner" | "staff";

export type Permission =
  | "chat.use"
  | "pos.use"
  /** void nota, atur limit kredit pelanggan, lihat laporan shift semua kasir */
  | "pos.manage"
  /** seluruh Portal Admin: data master, stock opname, review bon, laporan, audit agent, saran restock */
  | "portal.access"
  | "staff.manage"
  | "tenant.switch"
  | "tenant.approve";

const STAFF: readonly Permission[] = ["chat.use", "pos.use"];
const OWNER: readonly Permission[] = [...STAFF, "pos.manage", "portal.access", "staff.manage"];
const ADMIN: readonly Permission[] = [...OWNER, "tenant.switch", "tenant.approve"];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  staff: STAFF,
  owner: OWNER,
  admin: ADMIN,
};

export const ROLE_LABELS: Record<Role, string> = {
  staff: "Staf Kasir",
  owner: "Owner",
  admin: "Super Admin",
};

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "owner" || value === "staff";
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

/** Pesan 403 yang menyebut siapa yang berhak, supaya staf tahu harus minta ke siapa. */
export const PERMISSION_DENIED_MESSAGES: Record<Permission, string> = {
  "chat.use": "Akun ini tidak bisa memakai asisten chat",
  "pos.use": "Akun ini tidak bisa memakai kasir",
  "pos.manage": "Hanya owner/admin yang bisa melakukan tindakan kasir ini",
  "portal.access": "Hanya owner/admin yang bisa membuka Portal Admin",
  "staff.manage": "Hanya owner/admin yang boleh mengelola staf",
  "tenant.switch": "Hanya super admin yang bisa berpindah tenant",
  "tenant.approve": "Hanya super admin yang bisa menyetujui tenant baru",
};

export type ModuleKey = "chat" | "pos" | "portal" | "eval" | "tenants";

export interface AppModule {
  key: ModuleKey;
  href: string;
  label: string;
  description: string;
}

const MODULES: (AppModule & { permission: Permission })[] = [
  {
    key: "chat",
    href: "/chat",
    label: "Asisten Stok",
    description: "Tanya stok atau catat barang masuk/keluar lewat chat",
    permission: "chat.use",
  },
  {
    key: "pos",
    href: "/pos",
    label: "Kasir (POS)",
    description: "Buka shift dan catat penjualan",
    permission: "pos.use",
  },
  {
    key: "portal",
    href: "/admin",
    label: "Portal Admin",
    description: "Data master, stock opname, laporan, dan audit agent",
    permission: "portal.access",
  },
  {
    key: "eval",
    href: "/eval",
    label: "Evaluasi",
    description: "Jalankan skenario evaluasi agent (bab 4)",
    permission: "chat.use",
  },
  {
    key: "tenants",
    href: "/admin/tenants",
    label: "Kelola Tenant",
    description: "Pilih tenant aktif dan setujui pendaftaran toko baru",
    permission: "tenant.switch",
  },
];

/**
 * Modul yang boleh dibuka role ini, urut untuk menu pilih & navigasi.
 * Evaluasi hanya tampil kalau halaman /eval diaktifkan dan tenant aktif adalah
 * tenant evaluasi (halamannya sendiri juga menolak tenant lain).
 */
export function modulesFor(
  role: Role | null | undefined,
  options: { evalAvailable?: boolean } = {},
): AppModule[] {
  return MODULES.filter(
    (m) => can(role, m.permission) && (m.key !== "eval" || options.evalAvailable === true),
  ).map(({ key, href, label, description }) => ({
    key,
    href,
    label,
    description,
  }));
}

export const HOME_PATH = "/menu";

/**
 * Hanya menerima path relatif di app sendiri. Menolak URL absolut,
 * protocol-relative ("//evil.com"), dan backslash yang dinormalisasi browser
 * menjadi "/" ("/\\evil.com").
 */
export function safeRedirect(target: string | null | undefined): string | null {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return null;
  if (target.includes("\\") || /[\u0000-\u001f]/.test(target)) return null;
  if (target.startsWith("/login") || target.startsWith("/signup")) return null;
  return target;
}
