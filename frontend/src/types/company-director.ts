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
