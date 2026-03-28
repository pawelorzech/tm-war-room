export type Role = "superadmin" | "admin" | "member";

export interface MeResponse {
  player_id: number;
  role: Role;
  is_admin: boolean;
  is_superadmin: boolean;
}

export interface Announcement {
  id: number;
  type: "alert" | "warning" | "info" | "success";
  message: string;
  created_by: number;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: number | null;
  revoke_reason: string | null;
}
