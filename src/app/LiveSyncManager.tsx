import React from 'react';
import { useLiveFirestoreSync } from '@modules/live';

interface LiveSyncManagerProps {
  deviceId: string;
  currentFullDeviceName: string;
  initialSpectatorPin: string | null;
}

/**
 * Wrapper component to lazy load the massive useLiveFirestoreSync hook
 * and completely remove the Firebase Firestore SDK from the initial app startup.
 */
const LiveSyncManager: React.FC<LiveSyncManagerProps> = ({
  deviceId,
  currentFullDeviceName,
  initialSpectatorPin,
}) => {
  useLiveFirestoreSync({ deviceId, currentFullDeviceName, initialSpectatorPin });
  return null;
};

export default LiveSyncManager;
