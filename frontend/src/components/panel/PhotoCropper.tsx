"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { faNum } from "@/lib/format";

import { Modal } from "./ui";
import s from "./panel.module.css";

type Props = {
  files: File[];
  /** width / height of the frame, e.g. 3/4 for product photos or 1 for a logo */
  aspect: number;
  outWidth: number;
  onDone: (files: File[]) => void;
  onCancel: () => void;
};

const FRAME_W = 360;

/**
 * Crop each picked photo to the storefront frame before upload: drag to
 * position, slide to zoom. The result is a light WebP of a fixed size, so a
 * large phone photo uploads in a second and every card lines up.
 */
export function PhotoCropper({ files, aspect, outWidth, onDone, onCancel }: Props) {
  const frameH = Math.round(FRAME_W / aspect);
  const outHeight = Math.round(outWidth / aspect);
  const [index, setIndex] = useState(0);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const done = useRef<File[]>([]);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(files[index]);
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [files, index]);

  const base = img ? Math.max(FRAME_W / img.naturalWidth, frameH / img.naturalHeight) : 1;
  const scale = base * zoom;
  const w = img ? img.naturalWidth * scale : 0;
  const h = img ? img.naturalHeight * scale : 0;
  const clamp = useCallback(
    (o: { x: number; y: number }, ww = w, hh = h) => ({
      x: Math.max(-(ww - FRAME_W) / 2, Math.min((ww - FRAME_W) / 2, o.x)),
      y: Math.max(-(hh - frameH) / 2, Math.min((hh - frameH) / 2, o.y)),
    }),
    [w, h, frameH],
  );

  const render = async (image: HTMLImageElement, sc: number, off: { x: number; y: number }) => {
    const ww = image.naturalWidth * sc, hh = image.naturalHeight * sc;
    const left = FRAME_W / 2 - ww / 2 + off.x;
    const top = frameH / 2 - hh / 2 + off.y;
    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, -left / sc, -top / sc, FRAME_W / sc, frameH / sc, 0, 0, outWidth, outHeight);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
    const out = blob ?? (await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85)));
    const name = files[index]?.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([out!], `${name}.${out!.type === "image/webp" ? "webp" : "jpg"}`, { type: out!.type });
  };

  const next = (file?: File) => {
    if (file) done.current.push(file);
    if (index + 1 < files.length) setIndex(index + 1);
    else onDone(done.current);
  };

  const cropThis = async () => {
    if (!img) return;
    setBusy(true);
    next(await render(img, scale, offset));
    setBusy(false);
  };

  /** Centre-crop this and every remaining photo without stopping. */
  const cropRest = async () => {
    setBusy(true);
    const out = [...done.current];
    if (img) out.push(await render(img, scale, offset));
    for (const f of files.slice(index + 1)) {
      const url = URL.createObjectURL(f);
      const el = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      }).catch(() => null);
      URL.revokeObjectURL(url);
      if (el) out.push(await render(el, Math.max(FRAME_W / el.naturalWidth, frameH / el.naturalHeight), { x: 0, y: 0 }));
    }
    onDone(out);
  };

  return (
    <Modal
      title={files.length > 1 ? `برش عکس ${faNum(index + 1)} از ${faNum(files.length)}` : "برش عکس"}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} style={{ marginInlineEnd: "auto" }} onClick={() => next()} disabled={busy}>
            رد کردن این عکس
          </button>
          {files.length - index > 1 && (
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={cropRest} disabled={busy}>
              برش خودکار بقیه
            </button>
          )}
          <button type="button" className={s.btn} onClick={cropThis} disabled={busy || !img}>
            {busy ? "در حال آماده‌سازی…" : index + 1 < files.length ? "تأیید و عکس بعدی" : "تأیید"}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", justifyItems: "center", gap: 14 }}>
        <div
          className={s.cropFrame}
          style={{ width: FRAME_W, height: frameH }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setOffset(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }));
          }}
          onPointerUp={() => (drag.current = null)}
          onWheel={(e) => {
            const z = Math.max(1, Math.min(4, zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
            setZoom(z);
            setOffset((o) => clamp(o, img!.naturalWidth * base * z, img!.naturalHeight * base * z));
          }}
        >
          {img && (
            // eslint-disable-next-line @next/next/no-img-element -- local preview being cropped
            <img
              src={img.src}
              alt=""
              draggable={false}
              style={{ position: "absolute", width: w, height: h, left: FRAME_W / 2 - w / 2 + offset.x, top: frameH / 2 - h / 2 + offset.y, maxWidth: "none" }}
            />
          )}
          <span className={s.cropGrid} aria-hidden="true" />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, width: FRAME_W, fontSize: 13, color: "var(--muted)" }}>
          بزرگ‌نمایی
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => {
              const z = Number(e.target.value);
              setZoom(z);
              if (img) setOffset((o) => clamp(o, img.naturalWidth * base * z, img.naturalHeight * base * z));
            }}
            style={{ flex: 1, accentColor: "var(--accent)" }}
          />
        </label>
        <p className="hint" style={{ textAlign: "center" }}>
          عکس را بکشید تا لباس وسط قاب بیفتد. همین قاب روی کارت محصول در سایت نمایش داده می‌شود.
        </p>
      </div>
    </Modal>
  );
}
