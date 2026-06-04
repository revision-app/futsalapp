export type MemberRole = "admin" | "member";
export type EventType = "practice" | "match" | "party";
export type AttendanceStatus = "attending" | "absent" | "pending";

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  role: MemberRole;
  is_active: boolean;
  must_change_password: boolean;
  recovery_question: string | null;
  recovery_answer_salt: string | null;
  recovery_answer_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type Season = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_by: string;
  created_at: string;
};

export type Event = {
  id: string;
  season_id: string;
  title: string;
  event_type: EventType;
  location: string;
  event_date: string;
  created_by: string;
  created_at: string;
};

export type Attendance = {
  id: string;
  event_id: string;
  user_id: string;
  status: AttendanceStatus;
  updated_at: string;
};

export type MvpVote = {
  id: string;
  event_id: string;
  voter_id: string;
  votee_id: string;
  points: number;
  created_at: string;
};
