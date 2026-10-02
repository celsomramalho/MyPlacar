import type { Firestore } from 'firebase/firestore';
import {
  deleteAdminIcon as deleteFirebaseAdminIcon,
  saveAdminIcon as saveFirebaseAdminIcon,
  type AdminIconType,
  type FirebaseAdminCategoryIcon,
  type FirebaseAdminSportIcon,
} from '@infra/firebase/adminIcons';
import { updateUserPlanType } from '@infra/firebase/users';
import type { PlanType, UserProfile } from '@modules/auth/types';

export const updateAdminUserPlan = async (
  db: Firestore,
  user: UserProfile,
  planType: PlanType,
) => {
  await updateUserPlanType(db, user.email, planType);
};

export const saveAdminIcon = async (
  db: Firestore,
  type: AdminIconType,
  item: FirebaseAdminCategoryIcon | FirebaseAdminSportIcon,
) => {
  await saveFirebaseAdminIcon(db, type, item);
};

export const deleteAdminIcon = async (
  db: Firestore,
  type: AdminIconType,
  id: string,
) => {
  await deleteFirebaseAdminIcon(db, type, id);
};
