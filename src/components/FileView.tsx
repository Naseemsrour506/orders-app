import { useEffect, useState } from "react";
import { signedUrl } from "../lib/api";
import { isAudio, isImage } from "../lib/image";

/** מציג תמונה, נגן קול, או קישור להורדה, לפי סוג הקובץ */
export function FileView({
  path,
  name,
  mime,
  deleted,
}: {
  path: string;
  name: string | null;
  mime: string | null;
  deleted?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (deleted) return;
    let alive = true;
    signedUrl(path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [path, deleted]);

  if (deleted) return <div className="file gone">הקובץ נמחק (עברו 6 חודשים)</div>;
  if (failed) return <div className="file gone">הקובץ לא זמין</div>;
  if (!url) return <div className="file loading">טוען…</div>;

  if (isImage(mime)) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img className="photo" src={url} alt={name ?? "תמונה"} loading="lazy" />
      </a>
    );
  }
  if (isAudio(mime)) return <audio className="audio" controls preload="none" src={url} />;
  return <DownloadLink path={path} name={name} />;
}

export function DownloadLink({ path, name, label }: { path: string; name: string | null; label?: string }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const u = await signedUrl(path, name ?? "file");
      window.open(u, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="file" onClick={open} disabled={busy}>
      <span className="file-ic">⬇</span>
      <span className="file-name">{label ?? name ?? "קובץ"}</span>
    </button>
  );
}
