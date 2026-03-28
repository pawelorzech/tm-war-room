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
  alert: "bg-red-700 text-red-100",
  warning: "bg-yellow-700 text-yellow-100",
  info: "bg-blue-700 text-blue-100",
  success: "bg-green-700 text-green-100",
};
