export interface Partner {
  id: string;
  name?: string;
  nickname: string;
  pin: string;
  origin: 'referral' | 'qrcode' | 'manual';
  addedAt: number;
  isSelected?: boolean;
  gender?: 'M' | 'F';
}

export interface QueuePlayer {
  id: string;
  name: string;
  gender: 'M' | 'F';
  verified?: boolean;
  isSelected?: boolean;
}
