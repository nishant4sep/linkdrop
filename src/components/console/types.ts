export type ModerationItem = {
  id: string;
  post_id: string;
  submitted_by: string;
  resource_url: string;
  normalized_resource_url: string;
  resource_type: string;
  description: string | null;
  status: string;
  created_at: string;
  canonical_url?: string | null;
};

export type PayoutItem = {
  id: string;
  contributorId: string;
  contributorEmail: string | null;
  contributorName: string;
  contributorStatus: string;
  amount: number;
  unit: string;
  status: string;
  payout_reference: string | null;
  decision_reason: string | null;
  requested_at: string;
  decided_at: string | null;
};

export type ContributorItem = {
  userId: string;
  email: string | null;
  displayName: string;
  accountStatus: string;
  memberSince: string;
  submissions: number;
  approved: number;
  availablePoints: number;
  outstandingPoints: number;
};

export type ReportedItem = {
  resourceId: string;
  postId: string;
  postUrl: string | null;
  postCode: string | null;
  resourceUrl: string;
  resourceType: string;
  description: string | null;
  reportedAt: string;
  submitterIpHash: string | null;
  reports: Array<{ reason: string; details: string | null; created_at: string }>;
};

export type ApiError = { error?: string };
