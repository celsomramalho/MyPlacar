import type { Firestore } from 'firebase/firestore';
import {
  deleteAdminIcon,
  saveAdminIcon,
  type AdminIconType,
  type FirebaseAdminCategoryIcon,
  type FirebaseAdminSportIcon,
} from '@infra/firebase/adminIcons';
import { updateUserPlanType } from '@infra/firebase/users';
import { deleteIcon, mirrorIcon, mirrorUser } from '@infra/supabase';
import type { PlanType, UserProfile } from '@modules/auth/types';

export const updateAdminUserPlan = async (
  db: Firestore,
  user: UserProfile,
  planType: PlanType,
) => {
  await updateUserPlanType(db, user.email, planType);
  mirrorUser({ ...user, planType });
};

export const saveAdminIconAndMirror = async (
  db: Firestore,
  type: AdminIconType,
  item: FirebaseAdminCategoryIcon | FirebaseAdminSportIcon,
) => {
  await saveAdminIcon(db, type, item);
  mirrorIcon(type, item);
};

export const deleteAdminIconAndMirror = async (
  db: Firestore,
  type: AdminIconType,
  id: string,
) => {
  await deleteAdminIcon(db, type, id);
  deleteIcon(type, id);
};
