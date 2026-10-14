export interface PollOption {
  id: string;
  text: string;
  votes: number;
  voters?: string[];
}

export interface Reply {
  id: string;
  authorPin: string;
  authorName: string;
  content: string;
  createdAt: number;
}

export interface Communication {
  id: string;
  type: 'message' | 'poll' | 'support' | 'nps';
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  targetUserId?: string; // 'all' or specific PIN
  isPinned?: boolean;
  expiresAt?: number;
  poll?: {
    options: PollOption[];
    totalVotes: number;
    closed: boolean;
  };
  nps?: {
    scores: Record<string, number>; // user identifier (PIN/email) -> score 0..10
    comments?: Record<string, { comment: string; authorName: string; createdAt: number }>;
    totalResponses: number;
    closed?: boolean;
  };
  supportConfig?: {
    isActive: boolean;
  };
  reactions?: Record<string, string[]>; // emoji -> [userIds]
  readBy?: string[]; // [userIds]
  replies?: Reply[];
  pushSent?: boolean;
  emailSent?: boolean;
  eventPin?: string;
  notificationType?: string;
  categoryId?: string;
  paymentId?: string;
}
