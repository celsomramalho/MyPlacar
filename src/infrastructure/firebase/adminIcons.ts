import { collection, deleteDoc, doc, getDocs, setDoc, type Firestore } from 'firebase/firestore';

export type AdminIconType = 'category' | 'sport';

export interface FirebaseAdminCategoryIcon {
  id: string;
  name: string;
  url: string;
  isActive?: boolean;
  updatedAt?: string;
}

export interface FirebaseAdminSportIcon {
  id: string;
  name: string;
  url: string;
  group: string;
  engine: string;
  isActive?: boolean;
  updatedAt?: string;
}

const getIconCollectionName = (type: AdminIconType) =>
  type === 'category' ? 'category_icons' : 'sport_icons';

export const fetchAdminIconCatalog = async (db: Firestore) => {
  const [categorySnapshot, sportSnapshot] = await Promise.all([
    getDocs(collection(db, getIconCollectionName('category'))),
    getDocs(collection(db, getIconCollectionName('sport'))),
  ]);

  const categories = categorySnapshot.docs.map(
    docSnapshot => ({ id: docSnapshot.id, isActive: true, ...docSnapshot.data() }) as FirebaseAdminCategoryIcon,
  );
  const sports = sportSnapshot.docs.map(
    docSnapshot => ({ id: docSnapshot.id, isActive: true, ...docSnapshot.data() }) as FirebaseAdminSportIcon,
  );

  return { categories, sports };
};

export const saveAdminIcon = (
  db: Firestore,
  type: AdminIconType,
  item: FirebaseAdminCategoryIcon | FirebaseAdminSportIcon,
) => setDoc(doc(db, getIconCollectionName(type), item.id), item);

export const deleteAdminIcon = (
  db: Firestore,
  type: AdminIconType,
  id: string,
) => deleteDoc(doc(db, getIconCollectionName(type), id));
