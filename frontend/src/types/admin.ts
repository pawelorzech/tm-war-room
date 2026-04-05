export type Role = "superadmin" | "admin" | "member";

export interface MeResponse {
  player_id: number;
  role: Role;
  is_admin: boolean;
  is_superadmin: boolean;
}

export type AnnouncementType = "alert" | "warning" | "info" | "success";
export type AnnouncementState = "active" | "expired" | "revoked";

export interface Announcement {
  id: number;
  type: AnnouncementType;
  message: string;
  created_by: number;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: number | null;
  revoke_reason: string | null;
}

export function getAnnouncementState(a: Announcement): AnnouncementState {
  if (a.revoked_at) return "revoked";
  if (a.expires_at && new Date(a.expires_at) <= new Date()) return "expired";
  return "active";
}

export const ANNOUNCEMENT_TYPE_BADGE_STYLES: Record<AnnouncementType, string> = {
  alert: "bg-red-600 text-white dark:bg-red-700 dark:text-red-100",
  warning: "bg-yellow-500 text-white dark:bg-yellow-700 dark:text-yellow-100",
  info: "bg-blue-600 text-white dark:bg-blue-700 dark:text-blue-100",
  success: "bg-green-600 text-white dark:bg-green-700 dark:text-green-100",
};
