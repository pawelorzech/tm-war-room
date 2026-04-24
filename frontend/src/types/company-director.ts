// Field names match Torn API company selection responses
// See https://tornapi.tornplayground.eu/company/

export interface CompanyDetailed {
  advertising_budget: number;
  company_bank: number;
  company_funds: number;
  efficiency: number;
  environment: number;
  popularity: number;
  trains_available: number;
  value: number;
  upgrades?: {
    company_size?: number;
    staffroom_size?: string;
    storage_size?: string;
    storage_space?: number;
  };
}

export interface CompanyEmployee {
  name: string;
  position: string;
  days_in_company: number;
  wage: number;
  manual_labor?: number;
  intelligence?: number;
  endurance?: number;
  effectiveness?: {
    total: number;
    working_stats?: number;
    addiction?: number;
    inactivity?: number;
    merits?: number;
    director_education?: number;
    settled_in?: number;
  };
  last_action?: { relative?: string; status?: string; timestamp?: number };
  status?: { color?: string; state?: string; description?: string; details?: string; until?: number | null };
}

export interface CompanyApplication {
  userID: number;
  name: string;
  level: number;
  message: string;
  stats?: { manual_labor: number; intelligence: number; endurance: number };
  status: string;
  expires: number;
}

export interface CompanyStockItem {
  cost: number;
  price: number;
  rrp: number;
  in_stock: number;
  on_order: number;
  sold_amount: number;
  sold_worth: number;
}

export interface CompanyProfile {
  ID: number;
  name: string;
  company_type: number;
  rating: number;
  director: number;
  employees_hired: number;
  employees_capacity: number;
  daily_income: number;
  daily_customers: number;
  weekly_income: number;
  weekly_customers: number;
  days_old: number;
}

export interface DirectorMeResponse {
  is_director: boolean;
  company_id: number;
  company_name: string;
  company_type: number;
  position: string;
  detailed: CompanyDetailed | null;
  employees: Record<string, CompanyEmployee> | null;
  applications: Record<string, CompanyApplication> | null;
  stock: Record<string, CompanyStockItem> | null;
  profile: CompanyProfile | null;
}

export interface DirectorNewsEntry {
  id: number;
  news: string;
  timestamp: number;
}

export interface DirectorNewsResponse {
  is_director: boolean;
  news: DirectorNewsEntry[];
  count?: number;
}

export interface FactionCompanyEntry {
  company_id: number;
  company_name: string;
  company_type: number;
  members: { player_id: number; player_name: string; position: string }[];
  profile: CompanyProfile | null;
}

export interface DirectorFactionResponse {
  companies: FactionCompanyEntry[];
  count: number;
}

export interface CompanyTrendRow {
  snapshot_date: string;
  company_funds: number | null;
  company_bank: number | null;
  advertising_budget: number | null;
  value: number | null;
  popularity: number | null;
  efficiency: number | null;
  environment: number | null;
  trains_available: number | null;
  rating: number | null;
  daily_income: number | null;
  daily_customers: number | null;
  weekly_income: number | null;
  weekly_customers: number | null;
  employees_hired: number | null;
  employees_capacity: number | null;
}

export interface CompanyStockTrendRow {
  snapshot_date: string;
  product_name: string;
  cost: number | null;
  price: number | null;
  rrp: number | null;
  in_stock: number | null;
  on_order: number | null;
  sold_amount: number | null;
  sold_worth: number | null;
}

export interface DirectorTrendsResponse {
  company_id: number;
  days: number;
  company: CompanyTrendRow[];
  stock: CompanyStockTrendRow[];
}

export type StockRunwayStatus = 'ok' | 'low' | 'shortage';

export interface CompanyStockRunwayItem {
  product_name: string;
  cost: number | null;
  price: number | null;
  rrp: number | null;
  in_stock: number;
  on_order: number;
  available_stock: number;
  sold_amount: number;
  sold_worth: number;
  baseline_sold_amount: number;
  baseline_sold_worth: number;
  baseline_recorded_at: number;
  baseline_source: 'before_week' | 'within_week' | 'current' | null;
  history_complete: boolean;
  sold_since_monday: number;
  sold_worth_since_monday: number;
  elapsed_days: number;
  avg_daily_sold: number;
  projected_until_sunday: number;
  shortage: number;
  status: StockRunwayStatus;
}

export interface CompanyStockRunwayResponse {
  is_director: boolean;
  company_id: number;
  week_start_ts: number;
  week_end_ts: number;
  generated_at: number;
  days_remaining: number;
  history_complete: boolean;
  products: CompanyStockRunwayItem[];
}

export interface RankedApplicant {
  userID: number;
  name: string;
  level: number;
  message: string;
  status: string;
  expires: number;
  stats: { manual_labor: number; intelligence: number; endurance: number };
  stats_hidden: boolean;
  efficiency: {
    status?: boolean;
    message?: string;
    companies?: Record<string, Record<string, number>>;
  } | null;
  best_position: string | null;
  best_score: number | null;
}

export interface ApplicationsRankedResponse {
  is_director: boolean;
  tornstats_enabled: boolean;
  applicants: RankedApplicant[];
  count?: number;
}

// ---------------- Weekly comparison ----------------

export interface RankedCompanyRow {
  company_id: number;
  weekly_income: number | null;
  weekly_customers: number | null;
  daily_income: number | null;
  daily_customers: number | null;
  rating: number | null;
  employees_hired: number | null;
  employees_capacity: number | null;
  recorded_at: number;
  scope: 'director' | 'public';
  tracked_name: string | null;
  tracked_company_type: number | null;
  tracked_source: string | null;
}

export interface WeeklySalesProduct {
  product_name: string;
  amount: number;
  worth: number;
}

export interface WeeklySalesAggregate {
  products: WeeklySalesProduct[];
  total_amount: number;
  total_worth: number;
}

export interface ViewerWeeklySnapshot {
  company_id: number;
  snapshot_date: string;
  company_funds: number | null;
  company_bank: number | null;
  advertising_budget: number | null;
  popularity: number | null;
  efficiency: number | null;
  environment: number | null;
  trains_available: number | null;
  rating: number | null;
  daily_income: number | null;
  daily_customers: number | null;
  weekly_income: number | null;
  weekly_customers: number | null;
  employees_hired: number | null;
  employees_capacity: number | null;
  scope: string;
  recorded_at: number;
}

export interface WeeklyComparisonResponse {
  week_start_ts: number;
  week_end_ts: number;
  week_label: string;
  scope: 'same_type' | 'all';
  company_type_filter: number | null;
  viewer_company_id: number;
  viewer_company_type: number;
  viewer_rank: number | null;
  viewer_snapshot: ViewerWeeklySnapshot | null;
  viewer_weekly_sales: WeeklySalesAggregate | null;
  ranked: RankedCompanyRow[];
  tracked_total: number;
}

// ---------------- Pinned weeks ----------------

export interface PinnedWeek {
  id: number;
  player_id: number;
  company_id: number;
  week_start_ts: number;
  label: string;
  label_auto?: string;
  note: string | null;
  created_at: number;
}

export interface PinnedWeeksResponse {
  company_id: number;
  pinned: PinnedWeek[];
}

export interface PinnedWeekData extends PinnedWeek {
  week_end_ts: number;
  snapshot: ViewerWeeklySnapshot | null;
  weekly_sales: WeeklySalesAggregate | null;
}

// ---------------- Trains alerts ----------------

export interface TrainsAlertRow {
  company_id: number;
  alert_type: string;
  target_player_id: number;
  threshold_days: number;
  created_at: number;
}

export interface TrainsAlertsResponse {
  company_id: number;
  alerts: TrainsAlertRow[];
}
