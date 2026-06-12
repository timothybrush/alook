"use client";

import React, { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Artifact } from "@alook/shared";
import { X, Download } from "lucide-react";
import { getArtifactUrl } from "@/components/artifact-content-renderer";

type LightboxProps = {
  open: boolean;
  onClose: () => void;
} & (
  | { artifact: Artifact | null; workspaceId: string; imageUrl?: undefined }
  | { imageUrl: string; filename: string; artifact?: undefined; workspaceId?: undefined }
);

export function ImageLightbox(props: LightboxProps) {
  const { open, onClose } = props;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  let src: string;
  let alt: string;
  let downloadUrl: string | undefined;

  if (props.imageUrl) {
    if (!open) return null;
    src = props.imageUrl;
    alt = props.filename;
  } else {
    if (!open || !props.artifact) return null;
    src = getArtifactUrl(props.artifact.id, props.workspaceId);
    alt = props.artifact.filename;
    downloadUrl = getArtifactUrl(props.artifact.id, props.workspaceId, true);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={alt}
            onClick={(e) => e.stopPropagation()}
            className="rounded-full p-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Download className="size-5" />
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="size-5" />
        </button>
      </div>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
      />
    </div>,
    document.body,
  );
}
