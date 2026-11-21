export interface SaveBlobResult {
  saved: boolean;
  cancelled?: boolean;
  path?: string;
}

interface PywebviewSaveResult {
  saved?: boolean;
  cancelled?: boolean;
  path?: string;
  error?: string;
}

interface PywebviewWindow extends Window {
  pywebview?: {
    api?: {
      save_file?: (
        filename: string,
        dataBase64: string,
        fileTypes?: string[],
      ) => Promise<PywebviewSaveResult>;
    };
  };
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

interface FileTypeMeta {
  pywebviewTypes: string[];
  pickerType?: {
    description: string;
    accept: Record<string, string[]>;
  };
}

function getFileTypeMeta(filename: string): FileTypeMeta {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return {
      pywebviewTypes: ["Laporan PDF (*.pdf)", "Semua Berkas (*.*)"],
      pickerType: { description: "Laporan PDF", accept: { "application/pdf": [".pdf"] } },
    };
  }
  if (lower.endsWith(".png")) {
    return {
      pywebviewTypes: ["Gambar PNG (*.png)", "Semua Berkas (*.*)"],
      pickerType: { description: "Gambar PNG", accept: { "image/png": [".png"] } },
    };
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return {
      pywebviewTypes: ["Gambar JPG (*.jpg)", "Semua Berkas (*.*)"],
      pickerType: { description: "Gambar JPG", accept: { "image/jpeg": [".jpg", ".jpeg"] } },
    };
  }
  if (lower.endsWith(".txt")) {
    return {
      pywebviewTypes: ["Teks / Word (*.txt)", "Semua Berkas (*.*)"],
      pickerType: { description: "Dokumen Teks", accept: { "text/plain": [".txt"] } },
    };
  }
  if (lower.endsWith(".ana")) {
    return {
      pywebviewTypes: ["Berkas ANATES (*.ana)", "Semua Berkas (*.*)"],
      pickerType: { description: "Berkas ANATES", accept: { "application/xml": [".ana"] } },
    };
  }
  if (lower.endsWith(".xlsx")) {
    return {
      pywebviewTypes: ["Excel Workbook (*.xlsx)", "Semua Berkas (*.*)"],
      pickerType: {
        description: "Excel Workbook",
        accept: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
        },
      },
    };
  }
  if (lower.endsWith(".csv")) {
    return {
      pywebviewTypes: ["CSV (*.csv)", "Semua Berkas (*.*)"],
      pickerType: { description: "CSV", accept: { "text/csv": [".csv"] } },
    };
  }
  return {
    pywebviewTypes: ["Semua Berkas (*.*)"],
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Gagal membaca data berkas."));
    reader.readAsDataURL(blob);
  });
}

function triggerAnchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save a Blob using native Save As dialog when available, falling back to browser download. */
export async function saveBlobWithDialog(
  blob: Blob,
  filename: string,
): Promise<SaveBlobResult> {
  const win = window as PywebviewWindow;
  const meta = getFileTypeMeta(filename);

  const nativeSave = win.pywebview?.api?.save_file;
  if (typeof nativeSave === "function") {
    const base64Data = await blobToBase64(blob);
    const res = await nativeSave(filename, base64Data, meta.pywebviewTypes);
    if (res?.error) {
      throw new Error(res.error);
    }
    return {
      saved: Boolean(res?.saved),
      cancelled: Boolean(res?.cancelled),
      path: res?.path,
    };
  }

  if (typeof win.showSaveFilePicker === "function") {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: filename,
        types: meta.pickerType ? [meta.pickerType] : undefined,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { saved: true };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { saved: false, cancelled: true };
      }
      // Fall through to anchor download if SaveFilePicker is blocked by browser policy.
    }
  }

  triggerAnchorDownload(blob, filename);
  return { saved: true };
}
