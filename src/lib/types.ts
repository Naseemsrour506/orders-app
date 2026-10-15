export type Role = "manager" | "designer" | "field";
export type Status = "new" | "design" | "review" | "fix" | "approved" | "done";
export type MessageKind = "text" | "image" | "file" | "audio" | "draft" | "final" | "system";

export interface Me {
  id: string;
  name: string;
  role: Role;
  team_id: number | null;
}

export interface Member {
  id: string;
  name: string;
  role: Role;
  team_id: number | null;
  active: boolean;
  created_at: string;
}

export interface Team {
  id: number;
  name: string;
}

export interface Order {
  id: number;
  title: string;
  client_name: string;
  client_phone: string;
  address: string;
  field_notes: string;
  status: Status;
  design_due: string | null;
  scheduled_date: string | null;
  team_id: number | null;
  urgent: boolean;
  bumped_at: string | null;
  sent_to_designer_at: string | null;
  approved_at: string | null;
  done_at: string | null;
  done_photo_path: string | null;
  done_note: string;
  field_issue: string;
  final_file_path: string | null;
  final_file_name: string | null;
  source: "app" | "whatsapp";
  wa_phone: string | null;
  ai_summary: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  order_id: number;
  author_id: string | null;
  kind: MessageKind;
  body: string;
  file_path: string | null;
  file_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  file_deleted_at: string | null;
  created_at: string;
}

export interface FieldTask {
  id: number;
  title: string;
  client_name: string;
  client_phone: string;
  address: string;
  field_notes: string;
  scheduled_date: string;
  urgent: boolean;
  bumped_at: string | null;
  carried: boolean;
  done: boolean;
  done_at: string | null;
  done_photo_path: string | null;
  field_issue: string;
  final_file_path: string | null;
  final_file_name: string | null;
  team_id: number;
}

export const STATUS_LABEL: Record<Status, string> = {
  new: "חדשה",
  design: "בעבודה",
  review: "ממתין לאישור",
  fix: "חזר לתיקון",
  approved: "מאושר לביצוע",
  done: "בוצע",
};

export const ROLE_LABEL: Record<Role, string> = {
  manager: "מנהל",
  designer: "גרפיקאי",
  field: "צוות שטח",
};

/** אצל מי הכדור בכל סטטוס */
export const TURN: Record<Status, Role | null> = {
  new: "manager",
  design: "designer",
  review: "manager",
  fix: "designer",
  approved: "field",
  done: null,
};
