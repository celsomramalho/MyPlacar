import { useEffect } from 'react';
import { getDb } from '@infra/firebase/client';
import { findUserByPin } from '@infra/firebase/users';
import type { Firestore } from 'firebase/firestore';

interface UseJudgeLookupParams {
  judgePinInput: string;
  setIsSearchingJudgePin: (v: boolean) => void;
  setJudgeNicknameLookup: (v: string) => void;
}

export function useJudgeLookup({
  judgePinInput,
  setIsSearchingJudgePin,
  setJudgeNicknameLookup,
}: UseJudgeLookupParams): void {
  useEffect(() => {
    const lookup = async () => {
      const pin = judgePinInput.toUpperCase().trim();
      if (pin.length === 5) {
        setIsSearchingJudgePin(true);
        const db = getDb();
        if (!db) { setIsSearchingJudgePin(false); return; }
        try {
          const user = await findUserByPin(db as Firestore, pin, { fallbackNickname: 'Juiz' });
          setJudgeNicknameLookup(user ? user.nickname : 'Usuário não localizado');
        } catch {
          setJudgeNicknameLookup('');
        } finally {
          setIsSearchingJudgePin(false);
        }
      } else {
        setJudgeNicknameLookup('');
      }
    };
    lookup();
  }, [judgePinInput, setIsSearchingJudgePin, setJudgeNicknameLookup]);
}
