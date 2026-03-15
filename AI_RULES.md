# MyPlacar Pro - AI Development Rules

## Tech Stack
- **Framework**: React 18.x with TypeScript for type-safe development.
- **Styling**: Tailwind CSS v4 for utility-first responsive design.
- **Build Tool**: Vite for fast development and optimized production builds.
- **Backend/Database**: Firebase (Firestore) for real-time data synchronization.
- **Authentication**: Firebase Auth (supporting PIN, Password, and Biometrics).
- **Storage**: Firebase Storage for assets and user-uploaded content.
- **Icons**: Lucide React for a consistent and lightweight icon set.
- **Maps**: Leaflet for match location visualization.
- **AI Integration**: Google Gemini AI (@google/genai) for contextual match narration.
- **PWA**: Service Workers and Manifest for offline support and "Add to Home Screen" functionality.

## Library Usage Rules
- **Icons**: Always use `lucide-react`. Do not import icons from other libraries.
- **Styling**: Use Tailwind CSS classes exclusively. Avoid inline styles unless calculating dynamic values (e.g., progress bars).
- **Database**: 
  - Use `firebase/firestore` for main application logic.
  - Use `firebase/firestore/lite` specifically for lazy-loading non-critical assets like sport icons to save bandwidth.
- **State Management**: Use React Hooks (`useState`, `useEffect`, `useMemo`, `useCallback`) for local and shared state.
- **Components**: Follow the project's pattern of creating small, focused components in `src/components/` and full-screen views in `src/pages/` or `src/screens/`.
- **Formatting**: Use the utility functions in `src/utils/formatters.ts` for names (Sentence Case) and PIN masking to maintain UI consistency.
- **Maps**: Use `leaflet` for all geographic visualizations.
- **QR Scanning**: Use `html5-qrcode` for camera-based scanning features.

## UI/UX Guidelines
- **Golden Rule**: Apply "Sentence Case" to user-facing strings using the `applyGoldenRule` formatter.
- **Responsiveness**: All new components must be mobile-first and fully responsive.
- **Feedback**: Use the existing modal system and toast-like notifications to inform users of success or error states.
- **Performance**: Use `LazySportIcon` for sport icons to prevent blocking the UI during network fetches.