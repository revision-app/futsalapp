export type MemberRole = "admin" | "member";
export type EventType = "practice" | "match" | "party" | "camp";
export type AttendanceStatus = "attending" | "absent" | "tentative" | "pending";
export type FeedbackType = "opinion" | "request" | "bug" | "other";
export type MatchSessionStatus = "draft" | "confirmed";
export type MatchTeam = "rev1" | "rev2" | "rev3";

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  member_no: number | null;
  uniform_no: number | null;
  reading: string | null;
  login_id: string | null;
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
  end_date: string | null;
  mvp_voting_closed_at: string | null;
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

export type EventGuest = {
  id: string;
  event_id: string;
  display_name: string;
  created_by: string;
  created_at: string;
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

export type FeedbackItem = {
  id: string;
  user_id: string;
  feedback_type: FeedbackType;
  title: string;
  body: string;
  created_at: string;
};

export type MatchSession = {
  id: string;
  event_id: string;
  session_no: number;
  team_count: number;
  status: MatchSessionStatus;
  created_by: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchSessionPlayer = {
  id: string;
  session_id: string;
  user_id: string | null;
  guest_id: string | null;
  team: MatchTeam;
  created_at: string;
};

export type MatchGame = {
  id: string;
  session_id: string;
  game_no: number;
  team_a: MatchTeam;
  team_b: MatchTeam;
  rev1_gk_id: string | null;
  rev2_gk_id: string | null;
  rev3_gk_id: string | null;
  rev1_gk_guest_id: string | null;
  rev2_gk_guest_id: string | null;
  rev3_gk_guest_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchGoalRecord = {
  id: string;
  game_id: string;
  team: MatchTeam;
  scorer_id: string | null;
  scorer_guest_id: string | null;
  assist_id: string | null;
  assist_guest_id: string | null;
  created_by: string;
  updated_by: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
};
