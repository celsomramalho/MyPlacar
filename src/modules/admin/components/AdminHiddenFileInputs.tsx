import type { ChangeEvent, RefObject } from 'react';
import type { AdminIconUploadTarget } from '@modules/admin/types';

interface AdminHiddenFileInputsProps {
  iconInputRef: RefObject<HTMLInputElement>;
  importInputRef: RefObject<HTMLInputElement>;
  eventBannerInputRef: RefObject<HTMLInputElement>;
  uploadTarget: AdminIconUploadTarget | null;
  onIconLoaded: (target: AdminIconUploadTarget, dataUrl: string) => void;
  onImportJson?: (jsonStr: string) => void;
  onEventBannerLoaded: (dataUrl: string) => void;
}

export const AdminHiddenFileInputs = ({
  iconInputRef,
  importInputRef,
  eventBannerInputRef,
  uploadTarget,
  onIconLoaded,
  onImportJson,
  onEventBannerLoaded,
}: AdminHiddenFileInputsProps) => {
  const handleIconFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploadTarget) return;

    const target = uploadTarget;
    const reader = new FileReader();
    reader.onloadend = () => {
      onIconLoaded(target, reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onImportJson) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const result = readerEvent.target?.result as string;
      onImportJson(result);
    };
    reader.readAsText(file);
  };

  const handleEventBannerFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      onEventBannerLoaded(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <input type="file" ref={iconInputRef} className="hidden" accept="image/*" onChange={handleIconFileChange} />

      <input
        type="file"
        ref={importInputRef}
        className="hidden"
        accept="application/json"
        onChange={handleImportFileChange}
      />

      <input
        type="file"
        ref={eventBannerInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleEventBannerFileChange}
      />
    </>
  );
};
