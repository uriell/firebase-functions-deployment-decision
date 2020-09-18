import { Program } from 'typescript';

type Committer = {
  name: string;
  email: string;
  date: string;
};

type CommitReference = {
  url: string;
  sha: string;
};

enum CommitVerificationReasons {
  EXPIRED_KEY = 'expired_key',
  NOT_SIGNING_KEY = 'not_signing_key',
  GPGVERIFY_ERROR = 'gpgverify_error',
  GPGVERIFY_UNAVAILABLE = 'gpgverify_unavailable',
  UNSIGNED = 'unsigned',
  UNKNOWN_SIGNATURE_TYPE = 'unknown_signature_type',
  NO_USER = 'no_user',
  UNVERIFIED_EMAIL = 'unverified_email',
  BAD_EMAIL = 'bad_email',
  UNKNOWN_KEY = 'unknown_key',
  MALFORMED_SIGNATURE = 'malformed_signature',
  INVALID = 'invalid',
  VALID = 'valid',
}

type CommitVerification = {
  verified: boolean;
  reason: CommitVerificationReasons;
  signature: string | null;
  payload: string | null;
};

type CommitDetails = {
  url: string;
  message: string;
  comment_count: number;
  author: Committer;
  committer: Committer;
  tree: CommitReference;
  verification: CommitVerification;
};

type User = {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: 'User';
  site_admin: boolean;
};

type Commit = {
  url: string;
  sha: string;
  node_id: string;
  html_url: string;
  comments_url: string;
  commit: CommitDetails;
  author: User;
  committer: User;
  parents: CommitReference[];
};

type ChangedFile = {
  sha: string;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  blob_url: string;
  raw_url: string;
  contents_url: string;
  patch: string;
};

export interface GitHubCommitComparison {
  url: string;
  html_url: string;
  permalink_url: string;
  diff_url: string;
  patch_url: string;
  status: 'behind';
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  base_commit: Commit;
  merge_base_commit: Commit;
  commits: Commit[];
  files: ChangedFile[];
}

interface RefFile {
  referencedFileName: string;
  index: number;
  file: string;
}

export interface MultiMap<K, V> extends Map<K, V[]> {
  add(key: K, value: V): V[];
  remove(key: K, value: V): void;
}

export interface tsProgram extends Program {
  getRefFileMap(): MultiMap<string, RefFile> | undefined;
}

export interface RelativeRef {
  [key: string]: string[];
}

export interface ActionEnv extends NodeJS.ProcessEnv {
  COMPARE_URL: string;
  BEFORE_SHA: string;
  AFTER_SHA: string;
  GITHUB_TOKEN: string;
  GITHUB_WORKSPACE: string;
  FULL_DEPLOYMENT_REGEX?: string;
  INDIVIDUAL_FUNCTION_REGEX?: string;
  INDIVIDUAL_FUNCTION_GLOB?: string;
  FILE_CHANGES_REGEX_FILTER?: string;
}
