"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Dropzone, type FileRejection } from "@mantine/dropzone";
import { UploadPlaceholder } from "../ImageUpload/UploadPlaceholder";

export type FileDropzoneRejectionReason =
  "too-large" | "invalid-type" | "too-many" | "unknown";

export interface FileDropzoneRejection {
  file: File;
  reason: FileDropzoneRejectionReason;
}

export interface FileDropzoneProps {
  label: string;
  title?: string;
  description?: string;
  icon: ReactNode;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxSize?: number;
  minHeight?: CSSProperties["minHeight"];
  disabled?: boolean;
  onFilesSelected: (files: readonly File[]) => void;
  onFilesRejected?: (rejections: readonly FileDropzoneRejection[]) => void;
}

const MIME_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/(?:[a-z0-9!#$&^_.+-]+|\*)$/i;

function getDropzoneAccept(accept: string | undefined): string[] | undefined {
  if (!accept) {
    return undefined;
  }

  const mimeTypes = Array.from(
    new Set(
      accept
        .split(",")
        .map((value) => value.trim())
        .filter((value) => MIME_TYPE_PATTERN.test(value)),
    ),
  );

  return mimeTypes.length > 0 ? mimeTypes : undefined;
}

function getRejectionReason(
  rejection: FileRejection,
): FileDropzoneRejectionReason {
  const errorCodes = new Set(rejection.errors.map((error) => error.code));

  if (errorCodes.has("too-many-files")) {
    return "too-many";
  }

  if (errorCodes.has("file-too-large")) {
    return "too-large";
  }

  if (errorCodes.has("file-invalid-type")) {
    return "invalid-type";
  }

  return "unknown";
}

export function FileDropzone({
  label,
  title,
  description,
  icon,
  accept,
  multiple = false,
  maxFiles,
  maxSize,
  minHeight,
  disabled = false,
  onFilesSelected,
  onFilesRejected,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const dropzoneAccept = getDropzoneAccept(accept);

  const openPicker = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    openPicker();
  };

  const handleNativeSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";

    if (files.length === 0) {
      return;
    }

    const selectionLimit = multiple ? maxFiles : 1;
    if (selectionLimit !== undefined && files.length > selectionLimit) {
      onFilesRejected?.(files.map((file) => ({ file, reason: "too-many" })));
      return;
    }

    onFilesSelected(files);
  };

  const handleDrop = (files: File[]) => {
    setDragActive(false);
    onFilesSelected(files);
  };

  const handleReject = (rejections: FileRejection[]) => {
    setDragActive(false);
    onFilesRejected?.(
      rejections.map((rejection) => ({
        file: rejection.file,
        reason: getRejectionReason(rejection),
      })),
    );
  };

  return (
    <>
      <input
        ref={inputRef}
        data-file-dropzone-picker
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleNativeSelection}
      />
      <Dropzone
        data-file-dropzone
        role="button"
        aria-label={label}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        accept={dropzoneAccept}
        multiple={multiple}
        maxFiles={maxFiles}
        maxSize={maxSize}
        disabled={disabled}
        activateOnClick={false}
        activateOnKeyboard={false}
        inputProps={{ "aria-hidden": true, tabIndex: -1 }}
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDragEnter={() => {
          if (!disabled) {
            setDragActive(true);
          }
        }}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setDragActive(false);
          }
        }}
        onDrop={handleDrop}
        onReject={handleReject}
        p={0}
        w="100%"
      >
        <UploadPlaceholder
          icon={icon}
          title={title ?? label}
          description={description}
          interactive={!disabled}
          dropActive={!disabled && dragActive}
          minHeight={minHeight}
        />
      </Dropzone>
    </>
  );
}
