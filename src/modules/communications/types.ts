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
  type: 'message' | 'poll';
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
